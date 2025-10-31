import 'dotenv/config';
import app from './app.js';

const PORT = Number(process.env.PORT || 8080);
const HOST = '0.0.0.0';

const server = app.listen(PORT, HOST, () => {
  console.log(`[server] listening on ${HOST}:${PORT}`);
});

// Log & exit so Cloud Run restarts cleanly if something truly explodes
process.on('unhandledRejection', (err) => {
  console.error('[server] unhandledRejection', err);
  process.exit(1);
});
process.on('uncaughtException', (err) => {
  console.error('[server] uncaughtException', err);
  process.exit(1);
});

export default server;
