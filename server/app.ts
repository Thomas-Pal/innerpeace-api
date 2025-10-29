import cors from 'cors';
import express from 'express';
import { availabilityHandler } from './routes/availability.js';
import { createBooking, cancelBooking, updateBooking } from './routes/booking.js';
import { listBookings } from './routes/bookings.js';
import mediaRouter from './routes/media.js';
import { requireAuth } from './middleware/auth.js';
import youtubeRouter from './routes/youtube.js';
import jwksRoute from './routes/jwks.js';
import authMint from './routes/authMint.js';
import { devLoggerMiddleware } from './middleware/devLogger.js';
import { readProviderContext, requestLogMiddleware } from './middleware/requestContext.js';

const app = express();

app.use(cors());
app.use(express.json());
app.use(devLoggerMiddleware());
app.use(readProviderContext);
app.use(requestLogMiddleware);

app.get('/health', (_req, res) => res.status(200).send('ok'));

if (process.env.NODE_ENV !== 'production') {
  app.get('/__debug/headers', (req, res) => {
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

app.use(jwksRoute);
app.use(authMint);

app.use('/api/media', mediaRouter);
app.use('/api/youtube', youtubeRouter);

app.get('/api/availability', requireAuth, availabilityHandler);
app.get('/api/bookings', requireAuth, listBookings);
app.post('/api/book', requireAuth, createBooking);
app.delete('/api/book/:id', requireAuth, cancelBooking);
app.put('/api/book/:id', requireAuth, updateBooking);

export default app;
