import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { createFarmerService } from '../services/farmer-service.js';
import { createListingService } from '../services/listing-service.js';

const registerSchema = z.object({
  language: z.enum(['hi', 'kn', 'te', 'ta', 'mr', 'gu', 'bn', 'or', 'pa', 'ml', 'as', 'en']),
  state_code: z.string().length(2),
  district: z.string().min(2),
  geo_lat: z.number(),
  geo_lng: z.number()
});

const bankSchema = z.object({
  account_number: z.string().min(9).max(18),
  ifsc: z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/i)
});

const previewSchema = z.object({
  fpo_registration_number: z.string().min(3)
});

const confirmSchema = z.object({
  job_id: z.string(),
  confirmed: z.boolean()
});

export default async function (server: FastifyInstance) {
  const farmerService = createFarmerService(server);

  server.post('/register', { preHandler: server.authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
    const payload = registerSchema.parse(request.body);
    const userId = request.user.userId;
    const response = await farmerService.registerFarmer(userId, payload);
    return reply.code(200).send(response);
  });

  server.get('/kyc/initiate', { preHandler: server.authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user.userId;
    const response = await farmerService.initiateDigiLockerKyc(userId);
    return reply.send(response);
  });

  server.get('/kyc/callback', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as { code?: string; state?: string };
    if (!query.code || !query.state) {
      return reply.code(400).send({ error: 'code and state are required' });
    }

    const response = await farmerService.completeDigiLockerCallback(query.code, query.state);
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';

    if (response.status === 'ACTIVE') {
      return reply.redirect(`${frontendUrl}/register/bank`);
    }

    return reply.redirect(`${frontendUrl}/register/kyc`);
  });

  server.post('/bank/add', { preHandler: [server.authenticate, server.requireKYC] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const payload = bankSchema.parse(request.body);
    const userId = request.user.userId;
    const response = await farmerService.addBankAccount(userId, payload);
    return reply.send(response);
  });

  server.get('/me/listings', { preHandler: server.authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
    const listingService = createListingService(server);
    const query = request.query as { status?: string; page?: string; limit?: string };
    const status = query.status?.toUpperCase();
    const page = Number(query.page) || 1;
    const limit = Math.min(Number(query.limit) || 20, 100);
    const response = await listingService.getFarmerListings(request.user.userId, status, page, limit);
    return reply.send(response);
  });

  server.post('/fpo/bulk-register', { preHandler: server.authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.user.role !== 'FPO_ADMIN') {
      return reply.code(403).send({ error: 'FORBIDDEN' });
    }

    const parts = request.parts();
    let csvFile: any = null;
    let fpoRegistrationNumber = '';

    for await (const part of parts) {
      if (part.type === 'file' && part.fieldname === 'csv_file') {
        csvFile = part;
      }
      if (part.type === 'field' && part.fieldname === 'fpo_registration_number') {
        fpoRegistrationNumber = String(part.value);
      }
    }

    if (!csvFile) {
      return reply.code(400).send({ error: 'Missing CSV file' });
    }

    const payload = previewSchema.parse({ fpo_registration_number: fpoRegistrationNumber });
    const buffer = await csvFile.toBuffer();
    const response = await farmerService.previewFpoBulkRegister(payload.fpo_registration_number, buffer);
    return reply.send(response);
  });

  server.post('/fpo/bulk-register/confirm', { preHandler: server.authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.user.role !== 'FPO_ADMIN') {
      return reply.code(403).send({ error: 'FORBIDDEN' });
    }

    const payload = confirmSchema.parse(request.body);
    const response = await farmerService.confirmFpoBulkRegister(request.user.userId, payload.job_id, payload.confirmed);
    return reply.send(response);
  });

  server.get('/fpo/bulk-register/status/:job_id', { preHandler: server.authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.user.role !== 'FPO_ADMIN') {
      return reply.code(403).send({ error: 'FORBIDDEN' });
    }

    const { job_id } = request.params as { job_id: string };
    const response = await farmerService.getBulkRegisterStatus(job_id);
    return reply.send(response);
  });
}
