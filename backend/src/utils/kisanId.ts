import { FastifyInstance } from 'fastify';

const validStateCodes = new Set(['KA', 'MH', 'UP', 'TN', 'TE', 'GJ', 'WB', 'OR', 'PB', 'KL', 'AS', 'DL', 'RJ', 'MP', 'BR', 'HR']);

function randomSixDigits() {
  return Math.floor(Math.random() * 900000 + 100000).toString();
}

export async function generateUniqueKisanId(server: FastifyInstance, stateCode: string) {
  const upperState = stateCode.toUpperCase();
  if (!validStateCodes.has(upperState)) {
    throw new Error(`Unsupported state code: ${stateCode}`);
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = `KD-${upperState}-${randomSixDigits()}`;
    const result = await server.db.query('SELECT 1 FROM public.users WHERE kisan_id = $1 LIMIT 1', [candidate]);
    if (result.rows.length === 0) {
      return candidate;
    }
  }

  throw new Error('Unable to generate unique KisanID after multiple attempts');
}
