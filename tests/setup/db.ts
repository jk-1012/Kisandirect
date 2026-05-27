import pkg from 'pg'

const { Pool } = pkg as { Pool: any }
let pool: any

const connectionString = process.env.TEST_DATABASE_URL
if (!connectionString) {
  throw new Error('TEST_DATABASE_URL must be set for test DB helpers')
}

export async function getTestDb(): Promise<any> {
  if (!pool) {
    pool = new Pool({ connectionString })
  }
  return pool
}

export async function cleanDb(): Promise<void> {
  const db = await getTestDb()
  await db.query(`
    TRUNCATE TABLE
      dispute_audit_log,
      disputes,
      audit.transaction_ledger,
      cold_storage_bookings,
      orders,
      listings,
      price_alerts,
      consent_records,
      refresh_tokens,
      otp_sessions,
      vault.farmer_kyc,
      farmer_profiles,
      fpos,
      users
    RESTART IDENTITY CASCADE;
  `)
}

export async function createTestFarmer(overrides: Record<string, any> = {}) {
  const db = await getTestDb()
  const phone = `98765${Math.floor(Math.random() * 100000).toString().padStart(5, '0')}`
  const kisanId = `KD-KA-${Math.floor(100000 + Math.random() * 900000)}`

  const userResult = await db.query(`
    INSERT INTO users (phone, role, language, kyc_status, kisan_id, trust_score)
    VALUES ($1, 'FARMER', 'kn', 'ACTIVE', $2, 72)
    RETURNING *
  `, [phone, kisanId])

  const user = userResult.rows[0]

  await db.query(`
    INSERT INTO farmer_profiles (user_id, state_code, district, geo_lat, geo_lng)
    VALUES ($1, 'KA', 'Hassan', 12.87, 76.10)
  `, [user.id])

  await db.query(`
    INSERT INTO vault.farmer_kyc (farmer_id, aadhaar_encrypted, bank_verified, bank_account_token, bank_ifsc)
    VALUES ($1, pgp_sym_encrypt('123456789012', 'test_key'), TRUE, 'fa_test_token', 'SBIN0001234')
  `, [user.id])

  return { ...user, ...overrides }
}

export async function createTestBuyer(overrides: Record<string, any> = {}) {
  const db = await getTestDb()
  const phone = `87654${Math.floor(Math.random() * 100000).toString().padStart(5, '0')}`

  const userResult = await db.query(`
    INSERT INTO users (phone, role, language, kyc_status, trust_score)
    VALUES ($1, 'BUYER', 'en', 'ACTIVE', 60)
    RETURNING *
  `, [phone])

  return { ...userResult.rows[0], ...overrides }
}

export async function createTestListing(farmerId: string, overrides: Record<string, any> = {}) {
  const db = await getTestDb()
  const listingId = `LST-${Date.now()}-${Math.floor(100000 + Math.random() * 900000)}`

  const listingResult = await db.query(`
    INSERT INTO listings (
      listing_id,
      farmer_id,
      crop_type,
      crop_category,
      quantity_kg,
      quantity_remaining_kg,
      asking_price_paise,
      harvest_date,
      delivery_available,
      organic,
      status,
      expires_at
    ) VALUES ($1, $2, 'TOMATO', 'VEGETABLES', 500, 500, 2500, '2026-05-20', TRUE, FALSE, 'ACTIVE', NOW() + INTERVAL '72 hours')
    RETURNING *
  `, [listingId, farmerId])

  return { ...listingResult.rows[0], ...overrides }
}

export async function generateTestJWT(userId: string, role: string = 'FARMER') {
  const jsonwebtoken = await import('jsonwebtoken')
  const sign = (jsonwebtoken as any).sign
  const secret = process.env.JWT_SECRET
  if (!secret) {
    throw new Error('JWT_SECRET must be set for test JWT generation')
  }

  return sign({ userId, role, kycStatus: 'ACTIVE', phone: '9876543210' }, secret, {
    expiresIn: '1h'
  })
}
