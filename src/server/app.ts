import express from 'express';
import cors from 'cors';
import helmet from 'helmet';

// Routes
import healthRoutes from '../routes/health.js';
import mediaRoutes from '../routes/media.js';
import youtubeRoutes from '../routes/youtube.js';
import availabilityRoutes from '../routes/availability.js';

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

// Routes
app.use(healthRoutes);
app.use(mediaRoutes);
app.use('/youtube', youtubeRoutes);
app.use('/api/youtube', youtubeRoutes);
app.use('/api/availability', availabilityRoutes);

// Root ping
app.get('/', (_req, res) => res.json({ ok: true }));

export default app;
