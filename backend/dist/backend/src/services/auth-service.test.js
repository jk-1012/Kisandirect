import { createAuthService } from './auth-service';
import bcrypt from 'bcrypt';
import { jest } from '@jest/globals';
const mockDb = {
    query: jest.fn()
};
const mockQueues = {
    connection: {
        incr: jest.fn(),
        expire: jest.fn()
    }
};
const mockJwt = {
    sign: jest.fn().mockReturnValue('jwt-token')
};
const mockServer = {
    jwt: mockJwt,
    db: mockDb,
    queues: mockQueues,
    log: { warn: jest.fn(), error: jest.fn() },
    httpErrors: {
        unauthorized: (msg) => new Error(msg),
        tooManyRequests: (msg) => new Error(msg),
        internalServerError: (msg) => new Error(msg)
    }
};
beforeEach(() => {
    jest.clearAllMocks();
});
describe('AuthService', () => {
    const authService = createAuthService(mockServer);
    describe('OTP rate limiting', () => {
        it('blocks more than 3 requests per hour', async () => {
            mockQueues.connection.incr.mockResolvedValueOnce(1).mockResolvedValueOnce(2).mockResolvedValueOnce(3).mockResolvedValueOnce(4);
            mockQueues.connection.expire.mockResolvedValue(true);
            mockDb.query.mockResolvedValue({});
            await authService.requestOtp('9876543210');
            await authService.requestOtp('9876543210');
            await authService.requestOtp('9876543210');
            await expect(authService.requestOtp('9876543210')).rejects.toThrow('OTP request limit exceeded');
        });
    });
    describe('OTP expiry and attempts', () => {
        it('fails with expired OTP session', async () => {
            mockQueues.connection.incr.mockResolvedValue(1);
            mockDb.query.mockResolvedValueOnce({});
            mockDb.query.mockResolvedValueOnce({ rows: [] });
            await authService.requestOtp('9876543210');
            await expect(authService.verifyOtp('9876543210', '123456')).rejects.toThrow('Invalid or expired OTP');
        });
        it('blocks after 5 invalid attempts', async () => {
            mockDb.query.mockResolvedValueOnce({ rows: [{ id: '1', phone: '9876543210', otp_hash: await bcrypt.hash('999999', 10), attempts: 4, used: false }] });
            await expect(authService.verifyOtp('9876543210', '123456')).rejects.toThrow('OTP attempt limit exceeded');
        });
    });
    describe('JWT generation and refresh token rotation', () => {
        it('creates user and returns tokens', async () => {
            mockDb.query
                .mockResolvedValueOnce({ rows: [{ id: '1', phone: '9876543210', otp_hash: await bcrypt.hash('123456', 10), attempts: 0, used: false }] })
                .mockResolvedValueOnce({})
                .mockResolvedValueOnce({ rows: [] })
                .mockResolvedValueOnce({ rows: [{ id: '1', phone: '9876543210', role: 'FARMER', kisan_id: null, kyc_status: 'PENDING_KYC' }] })
                .mockResolvedValueOnce({});
            const compareMock = jest.spyOn(bcrypt, 'compare');
            compareMock.mockResolvedValue(true);
            const response = await authService.verifyOtp('9876543210', '123456');
            expect(response.accessToken).toBe('jwt-token');
            expect(response.refreshToken).toHaveLength(128);
            expect(response.user.phone).toBe('9876543210');
            expect(response.isNewUser).toBe(true);
        });
        it('rotates refresh token', async () => {
            mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'r1', user_id: '1', revoked: false, expires_at: new Date(Date.now() + 100000) }] });
            mockDb.query.mockResolvedValueOnce({});
            mockDb.query.mockResolvedValueOnce({ rows: [{ id: '1', phone: '9876543210', role: 'FARMER', kisan_id: null, kyc_status: 'PENDING_KYC' }] });
            mockDb.query.mockResolvedValueOnce({});
            const response = await authService.refreshToken('a'.repeat(128));
            expect(response.accessToken).toBe('jwt-token');
            expect(response.refreshToken).toHaveLength(128);
        });
    });
});
