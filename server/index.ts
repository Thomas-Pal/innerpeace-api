import 'dotenv/config';
import app from './app.js';
import config, { targetCalendarId } from './config/environment.js';

const port = config.port || 8080;

app.listen(port, '0.0.0.0', () => {
  console.log(`API listening on :${port}`);
  console.log(`Target calendar: ${targetCalendarId}`);
  const dwdEnabled =
    process.env.GOOGLE_DELEGATED_USER &&
    process.env.GOOGLE_CLIENT_EMAIL &&
    process.env.GOOGLE_PRIVATE_KEY;
  console.log(
    `Auth: user access token with${dwdEnabled ? '' : 'out'} DWD fallback (${process.env.GOOGLE_DELEGATED_USER || 'no delegated user'})`,
  );
  console.log(`Organizer mode: ${config.bookOrganizerMode}`);
});
