import cors from 'cors';
import express from 'express';
import availabilityRouter from './routes/availability.js';
import bookingRouter from './routes/booking.js';
import bookingsRouter from './routes/bookings.js';
import driveRouter from './routes/drive.js';
import healthRouter from './routes/health.js';
import media from './routes/media.js';

const app = express();

app.use(cors());
app.use(express.json());

app.use('/health', healthRouter);
app.use('/api/drive', driveRouter);
app.use('/api/availability', availabilityRouter);
app.use('/api/bookings', bookingsRouter);
app.use('/api/book', bookingRouter);
app.use('/api/media', media);

export default app;
