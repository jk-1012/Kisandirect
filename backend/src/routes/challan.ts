import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { createChallanService } from '../services/challan-service.js';

const verifySchema = z.object({ token: z.string().min(1) });

export default async function (server: FastifyInstance) {
  const challanService = createChallanService(server);

  server.get('/verify/challan/:token', async (request: FastifyRequest, reply: FastifyReply) => {
    const { token } = request.params as { token: string };
    const params = verifySchema.parse({ token });
    const challan = await challanService.getEChallanByToken(params.token);
    return reply.send(challan);
  });
}
