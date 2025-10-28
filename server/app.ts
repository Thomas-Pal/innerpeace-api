import cors from 'cors';
import express from 'express';
import { availabilityHandler } from './routes/availability.js';
import { createBooking, cancelBooking, updateBooking } from './routes/booking.js';
import { listBookings } from './routes/bookings.js';
import mediaRouter from './routes/media.js';
import { authHandler } from './middleware/auth.js';
import youtubeRouter from './routes/youtube.js';
import { devLoggerMiddleware } from './middleware/devLogger.js';
import { maybeAppJwt, requireAppJwt } from './middleware/appJwt.js';
import { readProviderContext, requestLogMiddleware } from './middleware/requestContext.js';

const app = express();

app.use(cors());
app.use(express.json());
app.use(devLoggerMiddleware());
app.use(readProviderContext);
app.use(requestLogMiddleware);

app.get('/health', maybeAppJwt(), (_req, res) => res.status(200).send('ok'));

if (process.env.NODE_ENV !== 'production') {
  app.get('/__debug/headers', maybeAppJwt(), (req, res) => {
    res.json({
      x_app_jwt: Boolean(req.get('x-app-jwt')),
      x_forwarded_authorization: req.get('x-forwarded-authorization') ?? null,
      authorization: req.get('authorization') ?? null,
      x_google_id_token: Boolean(req.get('x-google-id-token')),
      x_apple_identity_token: Boolean(req.get('x-apple-identity-token')),
    });
  });
} else {
  app.get('/__debug/headers', (_req, res) => {
    res.sendStatus(404);
  });
}

app.use('/api/media', mediaRouter);
app.use('/api/youtube', youtubeRouter);

app.get('/api/availability', requireAppJwt(), authHandler, availabilityHandler);
app.get('/api/bookings', requireAppJwt(), authHandler, listBookings);
app.post('/api/book', requireAppJwt(), authHandler, createBooking);
app.delete('/api/book/:id', requireAppJwt(), authHandler, cancelBooking);
app.put('/api/book/:id', requireAppJwt(), authHandler, updateBooking);

export default app;
