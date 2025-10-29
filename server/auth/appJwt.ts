import { SignJWT, importPKCS8, type KeyLike } from 'jose';

type SupportedAlg = 'ES256' | 'RS256';

const ISS = process.env.APP_JWT_ISSUER || 'https://innerpeace.app';
const AUD = process.env.APP_JWT_AUDIENCE || 'innerpeace-app';
const KID = process.env.APP_JWT_KID;
const PRIVATE_PEM = process.env.APP_JWT_PRIVATE_KEY_PEM;

let cachedKey: KeyLike | null = null;
let cachedAlg: SupportedAlg | null = null;

function inferAlgorithm(pem: string): SupportedAlg {
  if (pem.includes('EC PRIVATE KEY')) {
    return 'ES256';
  }

  if (pem.includes('BEGIN RSA PRIVATE KEY')) {
    return 'RS256';
  }

  if (pem.includes('BEGIN PRIVATE KEY')) {
    // PKCS#8 wrapper – default to ES256 unless explicitly marked RSA.
    return pem.includes('RSA') ? 'RS256' : 'ES256';
  }

  return 'RS256';
}

async function getSigningMaterial(): Promise<{ key: KeyLike; alg: SupportedAlg; kid: string }> {
  const pem = PRIVATE_PEM;
  if (!pem) {
    throw new Error('APP_JWT_PRIVATE_KEY_PEM is not configured');
  }

  const kid = KID;
  if (!kid) {
    throw new Error('APP_JWT_KID is not configured');
  }

  if (!cachedKey) {
    cachedAlg = inferAlgorithm(pem);
    cachedKey = await importPKCS8(pem, cachedAlg);
  }

  if (!cachedAlg) {
    cachedAlg = inferAlgorithm(pem);
  }

  return { key: cachedKey, alg: cachedAlg, kid };
}

export type AppJwtClaims = {
  sub: string;
  email?: string;
  provider?: 'google' | 'apple' | string;
  roles?: string[];
};

export async function mintAppJwt(claims: AppJwtClaims, ttlSec = 3600): Promise<string> {
  if (!claims || typeof claims.sub !== 'string' || claims.sub.length === 0) {
    throw new Error('claims.sub is required');
  }

  const { key, alg, kid } = await getSigningMaterial();
  const now = Math.floor(Date.now() / 1000);

  return await new SignJWT({ ...claims })
    .setProtectedHeader({ alg, kid, typ: 'JWT' })
    .setIssuer(ISS)
    .setAudience(AUD)
    .setIssuedAt(now)
    .setExpirationTime(now + ttlSec)
    .sign(key);
}
