import 'dotenv/config';
import app from './app.js';
import config, { targetCalendarId } from './config/environment.js';

const port = config.port || 8080;

app.listen(port, '0.0.0.0', () => {
  console.log(`API listening on :${port}`);
  console.log(`Target calendar: ${targetCalendarId}`);
  console.log(`Auth: DWD (impersonating ${process.env.GOOGLE_DELEGATED_USER || 'unset'})`);
  console.log(`Organizer mode: ${config.bookOrganizerMode}`);
});
