import cors from 'cors';
import express from 'express';
import { availabilityHandler } from './routes/availability.js';
import { createBooking, cancelBooking, updateBooking } from './routes/booking.js';
import { listBookings } from './routes/bookings.js';
import { listMedia, streamMedia } from './routes/media.js';
import { authMiddleware } from './middleware/auth.js';
import { devLoggerMiddleware } from './middleware/devLogger.js';

const app = express();

app.use(cors());
app.use(express.json());
app.use(devLoggerMiddleware());

app.get('/health', (_req, res) => res.status(200).send('ok'));

const protectedMiddleware = authMiddleware();
app.use(['/api/availability', '/api/bookings', '/api/book', '/api/media/list'], protectedMiddleware);

app.get('/api/availability', availabilityHandler);
app.get('/api/bookings', listBookings);
app.post('/api/book', createBooking);
app.delete('/api/book/:id', cancelBooking);
app.put('/api/book/:id', updateBooking);
app.get('/api/media/list', listMedia);
app.get('/api/media/stream/:id', streamMedia);

export default app;
