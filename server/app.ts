import cors from 'cors';
import express from 'express';
import { requireAuth } from './middleware/auth.js';
import mediaRoutes from './routes/media.js';
import bookingsRoutes from './routes/bookings.js';
import availabilityRoutes from './routes/availability.js';
import youtubeRouter from './routes/youtube.js';
import { devLoggerMiddleware } from './middleware/devLogger.js';

const app = express();

app.use(cors());
app.use(express.json());
app.use(devLoggerMiddleware());

app.get('/healthz', (_req, res) => res.status(200).send('ok'));

app.use('/api/media', requireAuth, mediaRoutes);
app.use('/api/bookings', requireAuth, bookingsRoutes);
app.use('/api/availability', requireAuth, availabilityRoutes);

app.use('/api/youtube', youtubeRouter);

export default app;
