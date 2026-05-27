/// <reference types="jest" />
import supertest from 'supertest'
import jwt from 'jsonwebtoken'
import { rest } from 'msw'
import { setupServer } from 'msw/node'
import { buildApp } from '../../src/app.js'
import { cleanDb, getTestDb, createTestFarmer } from '../setup/db.js'
import { msg91Handlers } from '../setup/mocks/index.js'

let app: any
let api: supertest.SuperTest<supertest.Test>
const msgServer = setupServer(...msg91Handlers)

beforeAll(async () => {
  app = await buildApp()
  await app.ready()
  api = supertest(app.server)
  msgServer.listen({ onUnhandledRequest: 'warn' })
})

afterEach(() => msgServer.resetHandlers())

afterAll(async () => {
  msgServer.close()
  await app.close()
})

beforeEach(async () => {
  await cleanDb()
})

async function getTokensForUser(phone: string) {
  let capturedOtp = '000000'
  msgServer.use(
    rest.post('https://api.msg91.com/api/v5/otp', async (req: any, res: any, ctx: any) => {
      const body = await req.json()
      capturedOtp = body.otp
      return res(ctx.json({ type: 'success', message: 'OTP sent successfully' }))
    })
  )

  await api.post('/api/v1/auth/otp/request').send({ phone })

  const verifyRes = await api
    .post('/api/v1/auth/otp/verify')
    .send({ phone, otp: capturedOtp })

  expect(verifyRes.status).toBe(200)
  return verifyRes.body
}

describe('POST /api/v1/auth/otp/request', () => {
  test('sends OTP for valid 10-digit mobile number', async () => {
    const res = await api.post('/api/v1/auth/otp/request').send({ phone: '9876543210' })

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      message: 'OTP sent',
      expires_in: 600,
    })
    expect(res.body).not.toHaveProperty('otp')
  })

  test('rejects mobile number starting with invalid prefix', async () => {
    const invalidNumbers = ['1234567890', '5555555555', '0987654321']
    for (const phone of invalidNumbers) {
      const res = await api.post('/api/v1/auth/otp/request').send({ phone })
      expect(res.status).toBe(400)
    }
  })

  test('enforces rate limit: blocks 4th OTP request within 1 hour', async () => {
    const phone = '9876543210'
    for (let i = 0; i < 3; i++) {
      await api.post('/api/v1/auth/otp/request').send({ phone })
    }

    const res = await api.post('/api/v1/auth/otp/request').send({ phone })
    expect(res.status).toBe(429)
    expect(res.body.error).toBe('RATE_LIMIT_EXCEEDED')
  })

  test('stores OTP as bcrypt hash, not plaintext', async () => {
    await api.post('/api/v1/auth/otp/request').send({ phone: '9876543210' })

    const db = await getTestDb()
    const session = await db.query('SELECT otp_hash FROM otp_sessions WHERE phone = $1', ['9876543210'])

    expect(session.rows[0]).toBeDefined()
    expect(session.rows[0].otp_hash).toMatch(/^\$2[aby]\$\d+\$/)
    expect(session.rows[0].otp_hash.length).toBeGreaterThan(50)
  })
})

describe('POST /api/v1/auth/otp/verify', () => {
  let otpPlaintext: string
  const phone = '9876543210'

  beforeEach(async () => {
    let capturedOtp = '123456'
    msgServer.use(
      rest.post('https://api.msg91.com/api/v5/otp', async (req: any, res: any, ctx: any) => {
        const body = await req.json()
        capturedOtp = body.otp
        return res(ctx.json({ type: 'success', message: 'OTP sent successfully' }))
      })
    )

    await api.post('/api/v1/auth/otp/request').send({ phone })
    otpPlaintext = capturedOtp
  })

  test('returns JWT and refresh token for new user', async () => {
    const res = await api.post('/api/v1/auth/otp/verify').send({ phone, otp: otpPlaintext })

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      isNewUser: true,
      expiresIn: 900,
    })
    expect(res.body.accessToken).toBeDefined()
    expect(res.body.refreshToken).toBeDefined()

    const decoded = jwt.decode(res.body.accessToken) as any
    expect(decoded.userId).toBeDefined()
    expect(decoded.exp - decoded.iat).toBe(900)
  })

  test('marks OTP session as used after successful verification', async () => {
    await api.post('/api/v1/auth/otp/verify').send({ phone, otp: otpPlaintext })

    const db = await getTestDb()
    const session = await db.query('SELECT used FROM otp_sessions WHERE phone = $1', [phone])
    expect(session.rows[0].used).toBe(true)
  })

  test('rejects already-used OTP', async () => {
    await api.post('/api/v1/auth/otp/verify').send({ phone, otp: otpPlaintext })
    const res = await api.post('/api/v1/auth/otp/verify').send({ phone, otp: otpPlaintext })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('OTP_ALREADY_USED')
  })

  test('blocks after 5 failed attempts', async () => {
    for (let i = 0; i < 5; i++) {
      await api.post('/api/v1/auth/otp/verify').send({ phone, otp: '000000' })
    }

    const res = await api.post('/api/v1/auth/otp/verify').send({ phone, otp: otpPlaintext })
    expect(res.status).toBe(429)
    expect(res.body.error).toBe('MAX_ATTEMPTS_EXCEEDED')
  })

  test('rejects expired OTP (older than 10 minutes)', async () => {
    const db = await getTestDb()
    await db.query("UPDATE otp_sessions SET expires_at = NOW() - INTERVAL '1 minute' WHERE phone = $1", [phone])

    const res = await api.post('/api/v1/auth/otp/verify').send({ phone, otp: otpPlaintext })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('OTP_EXPIRED')
  })
})

describe('POST /api/v1/auth/token/refresh', () => {
  test('issues new access token and rotates refresh token', async () => {
    const farmer = await createTestFarmer()
    const { refreshToken } = await getTokensForUser(farmer.phone)

    const res = await api.post('/api/v1/auth/token/refresh').send({ refreshToken })

    expect(res.status).toBe(200)
    expect(res.body.accessToken).toBeDefined()
    expect(res.body.refreshToken).toBeDefined()
    expect(res.body.refreshToken).not.toBe(refreshToken)

    const retryRes = await api.post('/api/v1/auth/token/refresh').send({ refreshToken })
    expect(retryRes.status).toBe(401)
  })
})
