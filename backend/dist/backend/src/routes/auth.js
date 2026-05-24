import { z } from 'zod';
import { createAuthService } from '../services/auth-service.js';
const requestOtpSchema = z.object({
    phone: z.string().regex(/^[6-9]\d{9}$/, 'Invalid Indian mobile number')
});
const verifyOtpSchema = requestOtpSchema.extend({
    otp: z.string().length(6)
});
const refreshTokenSchema = z.object({
    refreshToken: z.string().min(128)
});
export default async function (server) {
    const authService = createAuthService(server);
    server.post('/otp/request', async (request, reply) => {
        const { phone } = requestOtpSchema.parse(request.body);
        const result = await authService.requestOtp(phone);
        return reply.code(202).send(result);
    });
    server.post('/otp/verify', async (request, reply) => {
        const { phone, otp } = verifyOtpSchema.parse(request.body);
        const result = await authService.verifyOtp(phone, otp);
        return reply.send(result);
    });
    server.post('/token/refresh', async (request, reply) => {
        const { refreshToken } = refreshTokenSchema.parse(request.body);
        const result = await authService.refreshToken(refreshToken);
        return reply.send(result);
    });
    server.post('/logout', { preHandler: server.authenticate }, async (request, reply) => {
        const { refreshToken } = refreshTokenSchema.parse(request.body);
        const userId = request.user.userId;
        await authService.logout(refreshToken, userId);
        return reply.send({ success: true });
    });
}
