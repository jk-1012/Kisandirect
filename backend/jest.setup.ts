import { setupServer } from 'msw/node'
import handlers from '../tests/mocks/handlers'

// Setup MSW server for Jest tests
const server = setupServer(...handlers)

beforeAll(() => {
  // Ensure we are not pointed at prod
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Jest tests must not run in production environment')
  }
  server.listen({ onUnhandledRequest: 'warn' })
})

afterEach(() => server.resetHandlers())

afterAll(() => server.close())
