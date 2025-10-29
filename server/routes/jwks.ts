import { Router } from 'express';

const router = Router();

router.get('/.well-known/jwks.json', (_req, res) => {
  try {
    const jwkRaw = process.env.APP_JWT_PUBLIC_JWK;
    const kid = process.env.APP_JWT_KID;

    if (!jwkRaw) {
      throw new Error('APP_JWT_PUBLIC_JWK is not configured');
    }

    if (!kid) {
      throw new Error('APP_JWT_KID is not configured');
    }

    const jwk = JSON.parse(jwkRaw);

    if (!jwk || typeof jwk !== 'object' || Array.isArray(jwk)) {
      throw new Error('Public JWK must be an object');
    }

    if (!('kid' in jwk) || !jwk.kid) {
      (jwk as Record<string, unknown>).kid = kid;
    }

    res.setHeader('content-type', 'application/json');
    res.status(200).json({ keys: [jwk] });
  } catch (error) {
    res.status(500).json({ error: 'JWKS unavailable' });
  }
});

export default router;
