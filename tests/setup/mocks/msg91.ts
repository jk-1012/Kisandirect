import { rest } from 'msw'

export const msg91Handlers = [
  rest.post('https://api.msg91.com/api/v5/otp', (req, res, ctx) => {
    return res(ctx.json({ type: 'success', message: 'OTP sent successfully' }))
  }),

  rest.post('https://api.msg91.com/api/v2/sendsms', (req, res, ctx) => {
    return res(ctx.json({ type: 'success', message: 'SMS queued' }))
  }),
]
