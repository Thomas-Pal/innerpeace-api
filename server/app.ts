import cors from 'cors';
import express from 'express';
import { availabilityHandler } from './routes/availability.js';
import { createBooking, cancelBooking, updateBooking } from './routes/booking.js';
import { listBookings } from './routes/bookings.js';
import mediaRouter from './routes/media.js';
import { authHandler } from './middleware/auth.js';
import youtubeRouter from './routes/youtube.js';
import { devLoggerMiddleware } from './middleware/devLogger.js';

const app = express();

app.use(cors());
app.use(express.json());
app.use(devLoggerMiddleware());

app.get('/health', (_req, res) => res.status(200).send('ok'));

app.use('/api/media', mediaRouter);
app.use('/api/youtube', youtubeRouter);

app.get('/api/availability', authHandler, availabilityHandler);
app.get('/api/bookings', authHandler, listBookings);
app.post('/api/book', authHandler, createBooking);
app.delete('/api/book/:id', authHandler, cancelBooking);
app.put('/api/book/:id', authHandler, updateBooking);

export default app;
