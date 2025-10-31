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
app.use(
  cors({
    origin: true,
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  })
);
app.use(devLoggerMiddleware());

// Public endpoints
app.get('/healthz', (_req, res) => res.status(200).send('ok'));
app.use(healthRoutes);
app.use('/youtube', youtubeRouter);
app.use('/api/youtube', youtubeRouter);

// Protect everything else under /api with Supabase auth validation
app.use('/api', requireSupabaseAuth);

app.use('/api/media', mediaRoutes);
app.use('/api/bookings', bookingsRoutes);
app.use('/api/availability', availabilityRoutes);

// Diagnostics (temporary but useful)
app.get('/_diag/auth', (_req, res) => {
  res.json({
    supabaseUrlConfigured: Boolean(process.env.SUPABASE_URL),
    hasServiceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
  });
});

// Handle OPTIONS (preflight)
app.options('*', (_req, res) => res.sendStatus(204));

export default app;
