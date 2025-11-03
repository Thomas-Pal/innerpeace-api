import express from 'express';
import cors from 'cors';
import helmet from 'helmet';

// Routes
import healthRoutes from '../routes/health.js';
import mediaRoutes from '../routes/media.js';
import youtubeRoutes from '../routes/youtube.js';
import availabilityRoutes from '../routes/availability.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { buildCorrelationId, logger } from '../logging/logger.js';

const app = express();

// Request correlation + logging first so downstream middleware can use it
app.use((req, res, next) => {
  const id = buildCorrelationId(req.headers['x-correlation-id']);
  (req as any).correlationId = id;
  res.setHeader('x-correlation-id', id);
  next();
});

app.use((req, res, next) => {
  const start = Date.now();
  const id = (req as any).correlationId;
  logger.info({ tag: 'http.start', id, method: req.method, path: req.originalUrl });
  res.on('finish', () => {
    logger.info({
      tag: 'http.finish',
      id,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs: Date.now() - start,
    });
  });
  next();
});

// Public probes must stay unauthenticated
app.get('/healthz', (_req, res) => res.status(200).send('ok'));

// Global middleware
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors({
  origin: true,
  credentials: false,
  allowedHeaders: ['Content-Type', 'Authorization', 'x-supabase-auth'],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
}));
app.use(express.json());

// Public diagnostics
app.use(healthRoutes);

// Optional public debug to confirm headers arrive from device (remove later)
app.get('/api/debug/whoami', (req, res) => {
  res.json({
    ok: true,
    gotAuth: !!(req.headers.authorization || req.headers['x-supabase-auth']),
    hint: 'This is public; remove in prod.',
  });
});

// Protect everything else under /api
app.use('/api', requireAuth);

// Protected routes
app.use('/api', mediaRoutes);
app.use('/api/youtube', youtubeRoutes);
app.use('/api/availability', availabilityRoutes);

// Legacy public YouTube proxy
app.use('/youtube', youtubeRoutes);

// Root ping
app.get('/', (_req, res) => res.json({ ok: true }));

export default app;
