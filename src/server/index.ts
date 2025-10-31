import 'dotenv/config';
import app from './app.js';

const port = Number(process.env.PORT || 8080);
const host = '0.0.0.0';

app.set('trust proxy', 1);

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('[env] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY; protected routes will fail');
}

app.get('/healthz', (_req, res) => res.status(200).send('ok'));

const server = app.listen(port, host, () => {
  console.log(
    JSON.stringify({
      msg: 'server:start',
      port,
      host,
      service: process.env.K_SERVICE || null,
      region: process.env.K_REGION || null,
      supabaseUrl: !!process.env.SUPABASE_URL,
      hasServiceRole: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    }),
  );
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
