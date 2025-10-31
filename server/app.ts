import cors from 'cors';
import express from 'express';
import { requireSupabaseAuth } from './middleware/requireSupabaseAuth.js';
import mediaRoutes from './routes/media.js';
import bookingsRoutes from './routes/bookings.js';
import availabilityRoutes from './routes/availability.js';
import youtubeRouter from './routes/youtube.js';
import { devLoggerMiddleware } from './middleware/devLogger.js';
import healthRoutes from './routes/health.js';

const app = express();

app.disable('x-powered-by');
app.use(express.json());
app.use(cors({
  origin: true,
  credentials: true,
}));
app.use(devLoggerMiddleware());

// Public endpoints
app.get('/healthz', (_req, res) => res.status(200).send('ok'));
app.use(healthRoutes);
app.use('/youtube', youtubeRouter);
app.use('/api/youtube', youtubeRouter);

// Protect everything else under /api with HS256 check
app.use('/api', requireSupabaseAuth);

app.use('/api/media', mediaRoutes);
app.use('/api/bookings', bookingsRoutes);
app.use('/api/availability', availabilityRoutes);

// Diagnostics (temporary but useful)
app.get('/_diag/auth', (_req, res) => {
  res.json({
    expectingAlg: 'HS256',
    issuer: process.env.SUPABASE_ISSUER,
    aud: process.env.SUPABASE_AUD,
    hasSecret: Boolean(process.env.SUPABASE_JWT_SECRET && process.env.SUPABASE_JWT_SECRET.length >= 32),
  });
});

// Handle OPTIONS (preflight)
app.options('*', (_req, res) => res.sendStatus(204));

export default app;
