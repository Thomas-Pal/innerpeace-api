import express from 'express';
import cors from 'cors';
import helmet from 'helmet';

// Routes
import healthRoutes from '../routes/health.js';
import mediaRoutes from '../routes/media.js';
import youtubeRoutes from '../routes/youtube.js';
import availabilityRoutes from '../routes/availability.js';
import { requireAuth } from '../middleware/requireAuth.js';

const app = express();

// Keep startup “dumb”: no env throws here
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors({
  origin: true,
  credentials: false,
  allowedHeaders: ['Content-Type', 'Authorization'],
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
}));
app.use(express.json());

// Public probes
app.get('/healthz', (_req, res) => res.status(200).send('ok'));
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
