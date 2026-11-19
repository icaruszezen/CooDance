import { startStudioServer } from './app.js';

const server = await startStudioServer({
  host: process.env.COODANCE_HOST || '127.0.0.1',
  port: process.env.COODANCE_PORT ? Number(process.env.COODANCE_PORT) : 4170,
});

console.log(`CooDance Studio Engine running at ${server.url}`);

const shutdown = async () => {
  await server.close();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
