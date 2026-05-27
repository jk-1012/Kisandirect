import crypto from 'crypto'
import supertest from 'supertest'
import { buildApp } from '../../src/app.js'
import {
  cleanDb,
  createTestFarmer,
  createTestBuyer,
  createTestListing,
  getTestDb,
  generateTestJWT
} from '../setup/db.js'

let app: any
let api: supertest.SuperTest<supertest.Test>

beforeAll(async () => {
  process.env.DATABASE_URL ||= process.env.TEST_DATABASE_URL
  process.env.RAZORPAY_WEBHOOK_SECRET ||= 'test_webhook_secret'
  app = await buildApp()
  await app.ready()
  api = supertest(app.server)
})

afterAll(async () => {
  if (app) {
    await app.close()
  }
})

beforeEach(async () => {
  await cleanDb()
})

async function fireRazorpayWebhook(payload: object, secret = process.env.RAZORPAY_WEBHOOK_SECRET!) {
  const body = JSON.stringify(payload)
  const sig = crypto.createHmac('sha256', secret).update(body).digest('hex')
  return api
    .post('/api/v1/webhooks/razorpay')
    .set('x-razorpay-signature', sig)
    .set('Content-Type', 'application/json')
    .send(payload)
}

async function completeFullOrder(farmer: any, buyer: any, listing: any, quantityKg: number) {
  const buyerToken = await generateTestJWT(buyer.id, 'BUYER')
  const farmerToken = await generateTestJWT(farmer.id, 'FARMER')
  const db = await getTestDb()

  const orderRes = await api
    .post('/api/v1/orders/buy-now')
    .set('Authorization', `Bearer ${buyerToken}`)
    .send({ listing_id: listing.id, quantity_kg: quantityKg })

  expect(orderRes.status).toBe(201)

  const { order_id, razorpay_order_id, amount_paise } = orderRes.body
  const orderRow = await db.query('SELECT * FROM orders WHERE order_id = $1', [order_id])
  expect(orderRow.rows[0]).toBeDefined()

  const webhookPayload = {
    event: 'payment.captured',
    payload: {
      payment: {
        entity: {
          id: `pay_test_${Date.now()}`,
          order_id: razorpay_order_id,
          amount: amount_paise,
          status: 'captured'
        }
      }
    }
  }

  const webhookRes = await fireRazorpayWebhook(webhookPayload)
  expect(webhookRes.status).toBe(200)

  const dispatchRes = await api
    .patch(`/api/v1/orders/${order_id}/dispatch`)
    .set('Authorization', `Bearer ${farmerToken}`)
  expect(dispatchRes.status).toBe(200)

  const otpRes = await api
    .post(`/api/v1/orders/${order_id}/confirm-delivery`)
    .set('Authorization', `Bearer ${buyerToken}`)
  expect(otpRes.status).toBe(200)

  const orderRowAfterPayment = await db.query('SELECT id FROM orders WHERE order_id = $1', [order_id])
  const deliveryOtpRow = await db.query('SELECT otp_plaintext FROM delivery_otps WHERE order_id = $1', [orderRowAfterPayment.rows[0].id])
  expect(deliveryOtpRow.rows[0]).toBeDefined()

  const verifyRes = await api
    .post(`/api/v1/orders/${order_id}/verify-delivery-otp`)
    .set('Authorization', `Bearer ${buyerToken}`)
    .send({ otp: deliveryOtpRow.rows[0].otp_plaintext })
  expect(verifyRes.status).toBe(200)

  return { order_id, razorpay_order_id, amount_paise }
}

describe('Order + Escrow State Machine', () => {
  let farmer: any
  let buyer: any
  let listing: any

  beforeEach(async () => {
    farmer = await createTestFarmer()
    buyer = await createTestBuyer()
    listing = await createTestListing(farmer.id)
  })

  test('HAPPY PATH: complete order lifecycle — placement → escrow → delivery → payout', async () => {
    const buyerToken = await generateTestJWT(buyer.id, 'BUYER')
    const farmerToken = await generateTestJWT(farmer.id, 'FARMER')
    const db = await getTestDb()

    const orderRes = await api
      .post('/api/v1/orders/buy-now')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ listing_id: listing.id, quantity_kg: 100 })

    expect(orderRes.status).toBe(201)
    const { order_id, razorpay_order_id, amount_paise } = orderRes.body
    expect(amount_paise).toBe(100 * 2500 + Math.round(100 * 2500 * 0.02))

    const orderRow = await db.query('SELECT * FROM orders WHERE order_id = $1', [order_id])
    expect(orderRow.rows[0].payment_status).toBe('PENDING')
    expect(orderRow.rows[0].order_status).toBe('PLACED')

    const webhookRes = await fireRazorpayWebhook({
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: `pay_test_${Date.now()}`,
            order_id: razorpay_order_id,
            amount: amount_paise,
            status: 'captured'
          }
        }
      }
    })
    expect(webhookRes.status).toBe(200)

    const afterPayment = await db.query(
      'SELECT payment_status, escrow_release_at FROM orders WHERE order_id = $1',
      [order_id]
    )
    expect(afterPayment.rows[0].payment_status).toBe('ESCROW_HELD')
    expect(afterPayment.rows[0].escrow_release_at).toBeDefined()

    const listingAfter = await db.query('SELECT quantity_remaining_kg FROM listings WHERE id = $1', [listing.id])
    expect(parseFloat(listingAfter.rows[0].quantity_remaining_kg)).toBe(400)

    const ledger = await db.query(
      'SELECT event_type FROM audit.transaction_ledger WHERE order_id = $1 ORDER BY id',
      [orderRow.rows[0].id]
    )
    const events = ledger.rows.map((r: any) => r.event_type)
    expect(events).toContain('PAYMENT_RECEIVED')
    expect(events).toContain('ESCROW_HELD')

    const dispatchRes = await api
      .patch(`/api/v1/orders/${order_id}/dispatch`)
      .set('Authorization', `Bearer ${farmerToken}`)
    expect(dispatchRes.status).toBe(200)

    const otpRes = await api
      .post(`/api/v1/orders/${order_id}/confirm-delivery`)
      .set('Authorization', `Bearer ${buyerToken}`)
    expect(otpRes.status).toBe(200)

    const otpSession = await db.query('SELECT * FROM delivery_otps WHERE order_id = $1', [orderRow.rows[0].id])
    const deliveryOtp = otpSession.rows[0].otp_plaintext

    const verifyRes = await api
      .post(`/api/v1/orders/${order_id}/verify-delivery-otp`)
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ otp: deliveryOtp })
    expect(verifyRes.status).toBe(200)

    const final = await db.query('SELECT payment_status, order_status FROM orders WHERE order_id = $1', [order_id])
    expect(final.rows[0].payment_status).toBe('RELEASED')
    expect(final.rows[0].order_status).toBe('DELIVERED')

    const fullLedger = await db.query(
      'SELECT event_type FROM audit.transaction_ledger WHERE order_id = $1 ORDER BY id',
      [orderRow.rows[0].id]
    )
    const fullEvents = fullLedger.rows.map((r: any) => r.event_type)
    expect(fullEvents).toEqual(
      expect.arrayContaining(['PAYMENT_RECEIVED', 'ESCROW_HELD', 'ESCROW_RELEASED', 'COMMISSION_COLLECTED', 'FARMER_PAYOUT'])
    )

    const farmerProfile = await db.query('SELECT annual_payout_inr FROM farmer_profiles WHERE user_id = $1', [farmer.id])
    expect(farmerProfile.rows[0].annual_payout_inr).toBe(100 * 2500)
  })

  test('EDGE: rejects duplicate webhook (idempotency)', async () => {
    const firstOrderRes = await api
      .post('/api/v1/orders/buy-now')
      .set('Authorization', `Bearer ${await generateTestJWT(buyer.id, 'BUYER')}`)
      .send({ listing_id: listing.id, quantity_kg: 50 })

    expect(firstOrderRes.status).toBe(201)

    const webhookPayload = {
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_duplicate_test',
            order_id: firstOrderRes.body.razorpay_order_id,
            amount: firstOrderRes.body.amount_paise,
            status: 'captured'
          }
        }
      }
    }

    const first = await fireRazorpayWebhook(webhookPayload)
    expect(first.status).toBe(200)

    const second = await fireRazorpayWebhook(webhookPayload)
    expect(second.status).toBe(200)

    const db = await getTestDb()
    const ledger = await db.query(
      'SELECT COUNT(*) as cnt FROM audit.transaction_ledger WHERE event_type = $1',
      ['ESCROW_HELD']
    )
    expect(parseInt(ledger.rows[0].cnt, 10)).toBe(1)
  })

  test('EDGE: rejects webhook with invalid HMAC signature', async () => {
    const res = await fireRazorpayWebhook(
      { event: 'payment.captured', payload: {} },
      'wrong_secret_key'
    )
    expect(res.status).toBe(403)
    expect(res.body.error).toBe('Invalid webhook signature')
  })

  test('EDGE: cannot order more than available quantity', async () => {
    const res = await api
      .post('/api/v1/orders/buy-now')
      .set('Authorization', `Bearer ${await generateTestJWT(buyer.id, 'BUYER')}`)
      .send({ listing_id: listing.id, quantity_kg: 600 })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('INSUFFICIENT_QUANTITY')
  })

  test('EDGE: concurrent orders cannot exceed listing quantity', async () => {
    const buyer2 = await createTestBuyer()

    const [res1, res2] = await Promise.all([
      api
        .post('/api/v1/orders/buy-now')
        .set('Authorization', `Bearer ${await generateTestJWT(buyer.id, 'BUYER')}`)
        .send({ listing_id: listing.id, quantity_kg: 400 }),
      api
        .post('/api/v1/orders/buy-now')
        .set('Authorization', `Bearer ${await generateTestJWT(buyer2.id, 'BUYER')}`)
        .send({ listing_id: listing.id, quantity_kg: 400 })
    ])

    const statuses = [res1.status, res2.status]
    expect(statuses).toContain(201)
    expect(statuses).toContain(400)
  })

  test('EDGE: farmer cannot order their own listing', async () => {
    const res = await api
      .post('/api/v1/orders/buy-now')
      .set('Authorization', `Bearer ${await generateTestJWT(farmer.id, 'FARMER')}`)
      .send({ listing_id: listing.id, quantity_kg: 100 })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('SELF_ORDER_NOT_ALLOWED')
  })

  test('TDS: no deduction below ₹1,00,000 annual payout', async () => {
    const db = await getTestDb()
    await db.query('UPDATE farmer_profiles SET annual_payout_inr = 9000000 WHERE user_id = $1', [farmer.id])
    await completeFullOrder(farmer, buyer, listing, 200)

    const ledger = await db.query(
      'SELECT * FROM audit.transaction_ledger WHERE event_type = $1',
      ['TDS_DEDUCTED']
    )
    expect(ledger.rows.length).toBe(0)
  })

  test('TDS: 2% deducted when crossing ₹1,00,000 threshold (with PAN)', async () => {
    const db = await getTestDb()
    await db.query('UPDATE farmer_profiles SET annual_payout_inr = 9800000 WHERE user_id = $1', [farmer.id])
    await completeFullOrder(farmer, buyer, listing, 500)

    const ledger = await db.query(
      'SELECT amount_paise FROM audit.transaction_ledger WHERE event_type = $1',
      ['TDS_DEDUCTED']
    )
    expect(ledger.rows.length).toBe(1)

    const aboveThresholdPaise = 9800000 + 1250000 - 10000000
    const expectedTDS = Math.round(aboveThresholdPaise * 0.02)
    expect(parseInt(ledger.rows[0].amount_paise, 10)).toBe(expectedTDS)
  })

  test('TDS: 20% rate applied when farmer has no PAN', async () => {
    const db = await getTestDb()
    await db.query('UPDATE vault.farmer_kyc SET pan_encrypted = NULL WHERE farmer_id = $1', [farmer.id])
    await db.query('UPDATE farmer_profiles SET annual_payout_inr = 11000000 WHERE user_id = $1', [farmer.id])

    await completeFullOrder(farmer, buyer, listing, 100)

    const ledger = await db.query(
      'SELECT amount_paise FROM audit.transaction_ledger WHERE event_type = $1',
      ['TDS_DEDUCTED']
    )
    const payoutPaise = 100 * 2500
    const expectedTDS = Math.round(payoutPaise * 0.20)
    expect(parseInt(ledger.rows[0].amount_paise, 10)).toBe(expectedTDS)
  })
})
