import { rest } from 'msw'

const RAZORPAY_ORDER_API = 'https://api.razorpay.com/v1/orders'
const RAZORPAY_PAYMENTS_API = 'https://api.razorpay.com/v1/payments'

export const handlers = [
  // MSG91 OTP retrieval stub
  rest.post('https://api.msg91.com/api/v5/otp', (req, res, ctx) => {
    return res(ctx.status(200), ctx.json({ type: 'success', message: 'OTP sent' }))
  }),

  // Razorpay: create order (test-mode behavior)
  rest.post(RAZORPAY_ORDER_API, (req, res, ctx) => {
    const id = `order_${Math.random().toString(36).slice(2,9)}`
    const { amount, currency } = req.body as any
    return res(ctx.status(200), ctx.json({ id, amount, currency, status: 'created' }))
  }),

  // Razorpay: payment capture/webhook simulation
  rest.post(RAZORPAY_PAYMENTS_API, (req, res, ctx) => {
    const id = `pay_${Math.random().toString(36).slice(2,9)}`
    return res(ctx.status(200), ctx.json({ id, status: 'authorized' }))
  }),

  // DigiLocker KYC stub
  rest.get('https://api.digilocker.gov.in/public/v1/user', (req, res, ctx) => {
    return res(ctx.status(200), ctx.json({ id: 'DL123', name: 'Test Farmer', kyc: 'verified' }))
  }),

  // Vision API stub (image moderation/ocr)
  rest.post('https://vision.example.com/v1/analyze', (req, res, ctx) => {
    return res(ctx.status(200), ctx.json({ text: 'A sample OCR text', safe: true }))
  }),

  // Bhashini translation/stt stub
  rest.post('https://bhashini.ai/translate', (req, res, ctx) => {
    return res(ctx.status(200), ctx.json({ translated: 'translated text' }))
  }),
]

export default handlers
