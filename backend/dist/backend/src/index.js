import dotenv from 'dotenv';
import { buildApp } from './app.js';
dotenv.config();
const server = await buildApp();
const port = Number(process.env.PORT ?? 4000);
try {
    await server.listen({ port, host: '0.0.0.0' });
    server.log.info(`Backend running at http://0.0.0.0:${port}`);
}
catch (error) {
    server.log.error(error);
    process.exit(1);
}
