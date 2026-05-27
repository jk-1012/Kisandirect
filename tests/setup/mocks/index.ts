import { setupServer } from 'msw/node'
export { razorpayHandlers } from './razorpay.js'
export { msg91Handlers } from './msg91.js'
export { visionHandlers } from './visionApi.js'

export const mockServer = setupServer(...razorpayHandlers, ...msg91Handlers, ...visionHandlers)
