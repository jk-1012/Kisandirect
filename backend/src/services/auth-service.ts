import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

const requestOtpSchema = z.object({
  phone: z.string().regex(/^[6-9]\d{9}$/, 'Invalid Indian mobile number')
});

const verifyOtpSchema = requestOtpSchema.extend({
  otp: z.string().length(6)
});

const refreshTokenSchema = z.object({
  refreshToken: z.string().min(128)
});

const OTP_RATE_LIMIT_SECONDS = 60 * 60;
const OTP_EXPIRY_SECONDS = 10 * 60;
const REFRESH_TOKEN_EXPIRY = '30 days';

function hashRefreshToken(refreshToken: string) {
  return crypto.createHash('sha256').update(refreshToken).digest('hex');
}

async function sendOtpViaMsg91(server: FastifyInstance, phone: string, otp: string) {
  const authKey = process.env.MSG91_AUTH_KEY;
  const templateId = process.env.MSG91_OTP_TEMPLATE_ID;

  if (!authKey || !templateId) {
    server.log.warn('MSG91 OTP configuration missing, OTP not sent');
    return;
  }

  const response = await fetch('https://api.msg91.com/api/v5/otp', {
    method: 'POST',
    headers: {
      authkey: authKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      template_id: templateId,
      mobile: `91${phone}`,
      otp,
      otp_expiry: 10
    })
  });

  if (!response.ok) {
    const body = await response.text();
    server.log.error({ status: response.status, body }, 'MSG91 OTP request failed');
    throw server.httpErrors.internalServerError('Failed to send OTP');
  }
}

export function createAuthService(server: FastifyInstance) {
  async function createTokenPair(user: {
    id: string;
    phone: string;
    role: string;
    kisan_id: string | null;
    kyc_status: string;
  }) {
    const payload = {
      userId: user.id,
      phone: user.phone,
      role: user.role,
      kisanId: user.kisan_id,
      kycStatus: user.kyc_status
    };

    const accessToken = server.jwt.sign(payload, { expiresIn: '15m' });
    const refreshToken = crypto.randomBytes(64).toString('hex');
    const tokenHash = hashRefreshToken(refreshToken);

    await server.db.query(
      `INSERT INTO public.refresh_tokens (user_id, token_hash, expires_at, revoked, created_at) VALUES ($1, $2, NOW() + interval '30 days', FALSE, NOW())`,
      [user.id, tokenHash]
    );

    return { accessToken, refreshToken };
  }

  return {
    async requestOtp(phone: string) {
      const validated = requestOtpSchema.parse({ phone });
      const key = `otp:requests:${validated.phone}`;
      const count = await server.queues.connection.incr(key);

      if (count === 1) {
        await server.queues.connection.expire(key, OTP_RATE_LIMIT_SECONDS);
      }

      if (count > 3) {
        throw server.httpErrors.tooManyRequests('OTP request limit exceeded');
      }

      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const otpHash = await bcrypt.hash(otp, 10);

      await server.db.query(
        `INSERT INTO public.otp_sessions (phone, otp_hash, attempts, expires_at, used, created_at) VALUES ($1, $2, 0, NOW() + interval '10 minutes', FALSE, NOW())`,
        [validated.phone, otpHash]
      );

      await sendOtpViaMsg91(server, validated.phone, otp);

      return { message: 'OTP sent', expires_in: OTP_EXPIRY_SECONDS };
    },

    async verifyOtp(phone: string, otp: string) {
      const validated = verifyOtpSchema.parse({ phone, otp });
      const result = await server.db.query(
        'SELECT * FROM public.otp_sessions WHERE phone = $1 AND used = FALSE AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1',
        [validated.phone]
      );

      const session = result.rows[0];
      if (!session) {
        throw server.httpErrors.unauthorized('Invalid or expired OTP');
      }

      if (session.attempts >= 5) {
        throw server.httpErrors.tooManyRequests('OTP attempt limit exceeded');
      }

      const isMatch = await bcrypt.compare(validated.otp, session.otp_hash);
      if (!isMatch) {
        await server.db.query('UPDATE public.otp_sessions SET attempts = attempts + 1 WHERE id = $1', [session.id]);
        if (session.attempts + 1 >= 5) {
          throw server.httpErrors.tooManyRequests('OTP attempt limit exceeded');
        }
        throw server.httpErrors.unauthorized('Invalid OTP');
      }

      await server.db.query('UPDATE public.otp_sessions SET used = TRUE, attempts = attempts + 1 WHERE id = $1', [session.id]);

      const existingUser = await server.db.query(
        'SELECT id, phone, role, kisan_id, kyc_status FROM public.users WHERE phone = $1',
        [validated.phone]
      );

      let user = existingUser.rows[0];
      let isNewUser = false;

      if (!user) {
        const created = await server.db.query(
          'INSERT INTO public.users (phone, role, kyc_status, created_at, updated_at) VALUES ($1, $2, $3, NOW(), NOW()) RETURNING id, phone, role, kisan_id, kyc_status',
          [validated.phone, 'FARMER', 'PENDING_KYC']
        );
        user = created.rows[0];
        isNewUser = true;
      }

      const tokens = await createTokenPair(user);

      return {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: 900,
        user,
        isNewUser
      };
    },

    async refreshToken(refreshToken: string) {
      const validated = refreshTokenSchema.parse({ refreshToken });
      const tokenHash = hashRefreshToken(validated.refreshToken);
      const result = await server.db.query(
        'SELECT * FROM public.refresh_tokens WHERE token_hash = $1 AND revoked = FALSE AND expires_at > NOW() LIMIT 1',
        [tokenHash]
      );

      const row = result.rows[0];
      if (!row) {
        throw server.httpErrors.unauthorized('Invalid refresh token');
      }

      await server.db.query('UPDATE public.refresh_tokens SET revoked = TRUE WHERE id = $1', [row.id]);

      const userResult = await server.db.query(
        'SELECT id, phone, role, kisan_id, kyc_status FROM public.users WHERE id = $1',
        [row.user_id]
      );

      const user = userResult.rows[0];
      if (!user) {
        throw server.httpErrors.unauthorized('Invalid refresh token');
      }

      const tokens = await createTokenPair(user);
      return { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, expiresIn: 900 };
    },

    async logout(refreshToken: string, userId: string) {
      const validated = refreshTokenSchema.parse({ refreshToken });
      const tokenHash = hashRefreshToken(validated.refreshToken);
      await server.db.query(
        'UPDATE public.refresh_tokens SET revoked = TRUE WHERE token_hash = $1 AND user_id = $2',
        [tokenHash, userId]
      );
      return { success: true };
    }
  };
}
