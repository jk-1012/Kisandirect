import crypto from 'crypto'
import supertest from 'supertest'
import { buildApp } from '../../src/app.js'
import { createDisputeService } from '../../backend/src/services/dispute-service.js'
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

async function fireRazorpayWebhook(payload: object, secret = process.env.RAZORPAY_WEBHOOK_SECRET ?? 'test_webhook_secret') {
  const body = JSON.stringify(payload)
  const sig = crypto.createHmac('sha256', secret).update(body).digest('hex')
  return api
    .post('/api/v1/webhooks/razorpay')
    .set('x-razorpay-signature', sig)
    .set('Content-Type', 'application/json')
    .send(payload)
}

async function setupCompletedDelivery() {
  const farmer = await createTestFarmer()
  const buyer = await createTestBuyer()
  const listing = await createTestListing(farmer.id)
  const buyerToken = await generateTestJWT(buyer.id, 'BUYER')
  const farmerToken = await generateTestJWT(farmer.id, 'FARMER')
  const db = await getTestDb()

  const orderRes = await api
    .post('/api/v1/orders/buy-now')
    .set('Authorization', `Bearer ${buyerToken}`)
    .send({ listing_id: listing.id, quantity_kg: 100 })

  expect(orderRes.status).toBe(201)
  const { order_id: orderId, razorpay_order_id: razorpayOrderId, amount_paise: amountPaise } = orderRes.body

  const webhookRes = await fireRazorpayWebhook({
    event: 'payment.captured',
    payload: {
      payment: {
        entity: {
          id: `pay_test_${Date.now()}`,
          order_id: razorpayOrderId,
          amount: amountPaise,
          status: 'captured'
        }
      }
    }
  })
  expect(webhookRes.status).toBe(200)

  const dispatchRes = await api
    .patch(`/api/v1/orders/${orderId}/dispatch`)
    .set('Authorization', `Bearer ${farmerToken}`)
  expect(dispatchRes.status).toBe(200)

  const confirmRes = await api
    .post(`/api/v1/orders/${orderId}/confirm-delivery`)
    .set('Authorization', `Bearer ${buyerToken}`)
  expect(confirmRes.status).toBe(200)

  const orderRow = await db.query('SELECT id FROM orders WHERE order_id = $1', [orderId])
  expect(orderRow.rows[0]).toBeDefined()
  const deliveryOtpRow = await db.query('SELECT otp_plaintext FROM delivery_otps WHERE order_id = $1', [orderRow.rows[0].id])
  expect(deliveryOtpRow.rows[0]).toBeDefined()

  const verifyRes = await api
    .post(`/api/v1/orders/${orderId}/verify-delivery-otp`)
    .set('Authorization', `Bearer ${buyerToken}`)
    .send({ otp: deliveryOtpRow.rows[0].otp_plaintext })
  expect(verifyRes.status).toBe(200)

  return {
    farmer,
    buyer,
    listing,
    order: {
      order_id: orderId,
      razorpay_order_id: razorpayOrderId,
      amount_paise: amountPaise,
      id: orderRow.rows[0].id
    }
  }
}

async function setupDisputeWithEvidence() {
  const completed = await setupCompletedDelivery()
  const buyerToken = await generateTestJWT(completed.buyer.id, 'BUYER')
  const disputeRes = await api
    .post('/api/v1/disputes')
    .set('Authorization', `Bearer ${buyerToken}`)
    .send({ order_id: completed.order.order_id, reason: 'WRONG_QUANTITY', details: 'Less than ordered' })

  expect(disputeRes.status).toBe(201)
  const disputeId = disputeRes.body.dispute_id
  const db = await getTestDb()

  const evidenceUrl = `https://example.com/disputes/${disputeId}/evidence-1.jpg`
  await db.query(
    `UPDATE public.disputes SET status = 'EVIDENCE_SUBMITTED', evidence_urls = $1, evidence_uploaded_at = NOW(), updated_at = NOW() WHERE dispute_id = $2`,
    [[evidenceUrl], disputeId]
  )

  await db.query(
    `INSERT INTO public.dispute_evidence (dispute_id, uploaded_by, evidence_url, evidence_metadata)
     VALUES ((SELECT id FROM public.disputes WHERE dispute_id = $1), $2, $3, $4)`,
    [disputeId, completed.buyer.id, evidenceUrl, { source: 'buyer_confirmed' }]
  )

  return {
    ...completed,
    dispute: {
      dispute_id: disputeId
    }
  }
}

describe('Dispute Resolution State Machine', () => {
  test('raising dispute immediately freezes escrow in same transaction', async () => {
    const { farmer, buyer, order } = await setupCompletedDelivery()
    const db = await getTestDb()
    const buyerToken = await generateTestJWT(buyer.id, 'BUYER')

    const res = await api
      .post('/api/v1/disputes')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ order_id: order.order_id, reason: 'QUALITY_MISMATCH', details: 'Tomatoes were rotten' })

    expect(res.status).toBe(201)
    expect(res.body.status).toBe('AWAITING_EVIDENCE')

    const orderAfter = await db.query('SELECT payment_status FROM orders WHERE order_id = $1', [order.order_id])
    expect(orderAfter.rows[0].payment_status).toBe('DISPUTE_FROZEN')

    const ledger = await db.query(
      'SELECT event_type FROM audit.transaction_ledger WHERE order_id = $1',
      [order.id]
    )
    expect(ledger.rows.map((r: any) => r.event_type)).toContain('DISPUTE_FREEZE')
  })

  test('cannot raise dispute after 24-hour window', async () => {
    const { buyer, order } = await setupCompletedDelivery()
    const db = await getTestDb()
    await db.query(
      'UPDATE orders SET delivery_confirmed_at = NOW() - INTERVAL \'25 hours\' WHERE order_id = $1',
      [order.order_id]
    )

    const res = await api
      .post('/api/v1/disputes')
      .set('Authorization', `Bearer ${await generateTestJWT(buyer.id, 'BUYER')}`)
      .send({ order_id: order.order_id, reason: 'QUALITY_MISMATCH', details: 'Too late complaint' })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Disputes must be raised within 24 hours of delivery confirmation')
  })

  test('auto-closes in farmer favor if buyer provides no evidence within 12h', async () => {
    const { order, buyer } = await setupCompletedDelivery()
    const db = await getTestDb()
    const disputeService = createDisputeService(app)

    const disputeRes = await api
      .post('/api/v1/disputes')
      .set('Authorization', `Bearer ${await generateTestJWT(buyer.id, 'BUYER')}`)
      .send({ order_id: order.order_id, reason: 'WRONG_QUANTITY', details: 'Less than ordered' })

    expect(disputeRes.status).toBe(201)
    const disputeId = disputeRes.body.dispute_id

    await disputeService.autoCloseDisputeIfEvidenceMissing(disputeId)

    const finalDispute = await db.query(
      'SELECT status, resolution_outcome FROM disputes WHERE dispute_id = $1',
      [disputeId]
    )
    expect(finalDispute.rows[0].status).toBe('AUTO_CLOSED_FARMER')
    expect(finalDispute.rows[0].resolution_outcome).toBe('FARMER_FAVOR')

    const ledger = await db.query(
      'SELECT event_type FROM audit.transaction_ledger WHERE order_id = $1',
      [order.id]
    )
    expect(ledger.rows.map((r: any) => r.event_type)).toContain('DISPUTE_AUTO_CLOSED_FARMER')

    const finalOrder = await db.query('SELECT payment_status, order_status FROM orders WHERE order_id = $1', [order.order_id])
    expect(finalOrder.rows[0].order_status).toBe('DISPUTE_RESOLVED_FARMER')
  })

  test('full refund releases escrow to buyer correctly', async () => {
    const { order, buyer } = await setupDisputeWithEvidence()
    const db = await getTestDb()

    const agentPhone = `80000${Math.floor(Math.random() * 100000).toString().padStart(5, '0')}`
    const agentResult = await db.query(
      `INSERT INTO users (phone, role, language, kyc_status, trust_score)
       VALUES ($1, 'OPERATIONS', 'en', 'ACTIVE', 50)
       RETURNING *`,
      [agentPhone]
    )
    const agentToken = await generateTestJWT(agentResult.rows[0].id, 'OPERATIONS')
    const disputeIdRow = await db.query('SELECT dispute_id FROM disputes WHERE order_id = (SELECT id FROM orders WHERE order_id = $1)', [order.order_id])
    expect(disputeIdRow.rows[0]).toBeDefined()
    const disputeId = disputeIdRow.rows[0].dispute_id

    const decisionRes = await api
      .post(`/api/v1/disputes/${disputeId}/resolve`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ outcome: 'BUYER_FAVOR', notes: 'Evidence clearly shows damaged produce was delivered to buyer.' })

    expect(decisionRes.status).toBe(200)

    const ledger = await db.query(
      'SELECT event_type FROM audit.transaction_ledger WHERE order_id = $1',
      [order.id]
    )
    expect(ledger.rows.map((r: any) => r.event_type)).toContain('DISPUTE_RESOLVED_BUYER')

    const finalOrder = await db.query('SELECT payment_status FROM orders WHERE order_id = $1', [order.order_id])
    expect(finalOrder.rows[0].payment_status).toBe('REFUNDED')
  })
})
