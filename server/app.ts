import cors from 'cors';
import express from 'express';
import { requireSupabaseAuth } from './middleware/requireSupabaseAuth.js';
import mediaRoutes from './routes/media.js';
import bookingsRoutes from './routes/bookings.js';
import availabilityRoutes from './routes/availability.js';
import youtubeRouter from './routes/youtube.js';
import { devLoggerMiddleware } from './middleware/devLogger.js';

const app = express();

// CORS – allow your app origins, and gateway domain
const allowed = [
  'exp://',
  'http://localhost:19006',
  'http://localhost:8081',
  'https://innerpeace-gw-4ubziwcf.nw.gateway.dev',
  'https://innerpeace.app',
  'https://www.innerpeace.app',
];
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (allowed.some((a) => origin.startsWith(a))) return cb(null, true);
    return cb(null, true);
  },
  credentials: true,
}));
app.use(express.json());
app.use(devLoggerMiddleware());

// Public
app.get('/healthz', (_req, res) => res.json({ ok: true }));

// Protected – everything under /api
app.use('/api', requireSupabaseAuth);

app.use('/api/media', mediaRoutes);
app.use('/api/bookings', bookingsRoutes);
app.use('/api/availability', availabilityRoutes);
app.use('/api/youtube', youtubeRouter);

// Handle OPTIONS (preflight)
app.options('*', (_req, res) => res.sendStatus(204));

export default app;
