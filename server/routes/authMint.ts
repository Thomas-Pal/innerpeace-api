import { Router } from 'express';
import { mintAppJwt } from '../auth/appJwt.js';

const router = Router();

router.post('/auth/mint', async (req, res) => {
  try {
    const { sub, email, provider, roles, ttlSec } = req.body ?? {};

    if (typeof sub !== 'string' || sub.length === 0) {
      return res.status(400).json({ code: 400, message: 'sub required' });
    }

    if (ttlSec !== undefined && typeof ttlSec !== 'number') {
      return res.status(400).json({ code: 400, message: 'ttlSec must be a number' });
    }

    if (roles !== undefined) {
      const isValidRoles = Array.isArray(roles) && roles.every((role) => typeof role === 'string');
      if (!isValidRoles) {
        return res.status(400).json({ code: 400, message: 'roles must be an array of strings' });
      }
    }

    const token = await mintAppJwt({ sub, email, provider, roles }, ttlSec ?? 3600);
    return res.status(200).json({ token });
  } catch (error) {
    return res.status(500).json({ code: 500, message: 'Failed to mint JWT' });
  }
});

export default router;
