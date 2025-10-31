import { Router } from 'express';
import { listMediaHandler } from '../http/media.js';

const r = Router();

r.get('/media/list', listMediaHandler);

export default r;
