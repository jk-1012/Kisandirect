import { rest } from 'msw'

export const razorpayHandlers = [
  rest.post('https://api.razorpay.com/v1/orders', async (req, res, ctx) => {
    const body = await req.json()
    return res(ctx.json({
      id: `order_test_${Date.now()}`,
      entity: 'order',
      amount: body.amount,
      currency: 'INR',
      status: 'created',
      receipt: body.receipt,
    }))
  }),

  rest.post('https://api.razorpay.com/v1/fund_accounts', async (req, res, ctx) => {
    const body = await req.json()
    return res(ctx.json({
      id: `fa_test_${Date.now()}`,
      entity: 'fund_account',
      contact_id: 'cont_test',
      account_type: 'bank_account',
      bank_account: {
        name: 'Test Farmer',
        ifsc: 'SBIN0001234',
        account_number: '****1234',
      },
      ...body,
    }))
  }),

  rest.post('https://api.razorpay.com/v1/payouts', async (req, res, ctx) => {
    const body = await req.json()
    return res(ctx.json({
      id: `pout_test_${Date.now()}`,
      entity: 'payout',
      fund_account_id: body.fund_account_id,
      amount: body.amount,
      currency: 'INR',
      mode: 'IMPS',
      status: 'processing',
    }))
  }),
]
