import { Pool } from 'pg'

const pool = new Pool({
  connectionString: process.env.TEST_DATABASE_URL || 'postgresql://test:test@localhost:5433/kisandirect_test',
})

export async function beginTransaction() {
  const client = await pool.connect()
  await client.query('BEGIN')
  return client
}

export async function rollbackTransaction(client: any) {
  try {
    await client.query('ROLLBACK')
  } finally {
    client.release()
  }
}

export async function closePool() {
  await pool.end()
}
