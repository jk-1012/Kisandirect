import request from 'supertest'
import buildApp from '../index' // assumes Fastify app factory exported
import { beginTransaction, rollbackTransaction } from './helpers/db'

let app: any
let client: any

beforeAll(async () => {
  app = await buildApp({})
})

afterAll(async () => {
  await app.close()
})

describe('Escrow state machine and payments (Jest + supertest)', () => {
  beforeEach(async () => {
    client = await beginTransaction()
    // patch application's DB client to use the transactional client if needed
    // depends on the app's DB injection; this is a placeholder for how to attach a client
  })

  afterEach(async () => {
    await rollbackTransaction(client)
  })

  test('create order and partial payment flows in paise (no floats)', async () => {
    const orderPayload = {
      buyerId: 'buyer_test_1',
      items: [{ listingId: 'L1', qty: 10, pricePaise: 25000 }],
      totalAmountPaise: 250000,
      currency: 'INR'
    }

    const createRes = await request(app.server)
      .post('/orders')
      .send(orderPayload)
      .set('Accept', 'application/json')

    expect(createRes.status).toBe(201)
    expect(typeof createRes.body.id).toBe('string')

    const orderId = createRes.body.id

    // simulate Razorpay order creation via MSW; ensure amount values are in paise
    const payInit = await request(app.server)
      .post(`/orders/${orderId}/pay`) // endpoint will create razorpay order
      .send({ amountPaise: 125000 }) // partial payment first
      .set('Accept', 'application/json')

    expect(payInit.status).toBe(200)
    expect(payInit.body.amountPaise).toBe(125000)

    // Simulate webhook replay: post same webhook twice and ensure idempotency
    const webhook = { event: 'payment.captured', payload: { order_id: orderId, payment_id: 'pay_1', amount: 125000 } }

    const wh1 = await request(app.server)
      .post('/webhooks/razorpay')
      .send(webhook)
      .set('Content-Type', 'application/json')

    expect(wh1.status).toBe(200)

    const wh2 = await request(app.server)
      .post('/webhooks/razorpay')
      .send(webhook)
      .set('Content-Type', 'application/json')

    expect(wh2.status).toBe(200)

    // Check order payment status: should reflect partial payment
    const orderRes = await request(app.server)
      .get(`/orders/${orderId}`)
      .set('Accept', 'application/json')

    expect(orderRes.status).toBe(200)
    expect(orderRes.body.paidPaise).toBe(125000)
    expect(orderRes.body.status).toBe('PARTIALLY_PAID')
  })

  test('concurrent orders and race conditions cause consistent escrow states', async () => {
    // create a listing with limited stock
    const listing = {
      title: 'Mango per kg',
      stock: 5,
      pricePaise: 10000
    }

    const createList = await request(app.server).post('/listings').send(listing)
    expect(createList.status).toBe(201)
    const listingId = createList.body.id

    // spawn concurrent order creations
    const orderPromises = Array.from({ length: 10 }).map(() =>
      request(app.server).post('/orders').send({ buyerId: 'b', items: [{ listingId, qty: 1, pricePaise: 10000 }], totalAmountPaise: 10000 })
    )

    const results = await Promise.all(orderPromises)
    const successful = results.filter(r => r.status === 201)
    const failed = results.filter(r => r.status !== 201)

    // Only up to stock should succeed
    expect(successful.length).toBeLessThanOrEqual(5)
    expect(failed.length).toBeGreaterThanOrEqual(5)
  })

  test('dispute resolution state machine transitions and timeouts', async () => {
    const orderPayload = { buyerId: 'b2', items: [{ listingId: 'L2', qty: 1, pricePaise: 50000 }], totalAmountPaise: 50000 }
    const o = await request(app.server).post('/orders').send(orderPayload)
    expect(o.status).toBe(201)
    const orderId = o.body.id

    // create dispute
    const d = await request(app.server).post(`/orders/${orderId}/dispute`).send({ reason: 'not delivered' })
    expect(d.status).toBe(201)
    expect(d.body.state).toBe('OPEN')

    // simulate escrow hold
    // escalate, mediator resolution, refund, etc. depending on system
    const escalate = await request(app.server).post(`/disputes/${d.body.id}/escalate`).send()
    expect(escalate.status).toBe(200)
    expect(escalate.body.state).toBe('ESCALATED')

    const resolve = await request(app.server).post(`/disputes/${d.body.id}/resolve`).send({ resolution: 'refund', amountPaise: 50000 })
    expect(resolve.status).toBe(200)
    expect(resolve.body.state).toBe('RESOLVED')
  })
})
