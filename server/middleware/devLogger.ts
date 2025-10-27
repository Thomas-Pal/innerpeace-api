import type { Request, RequestHandler } from 'express';

type MaybeAuthedRequest = Request & {
  user?: {
    provider: string;
    uid: string;
  };
};

const summarizeAuthHeaders = (req: Request): string => {
  const providerHeader = (req.headers['x-auth-provider'] || '').toString() || 'none';
  const hasBearer = typeof req.headers.authorization === 'string' && req.headers.authorization.trim().length > 0;
  const hasGoogleOauth = typeof req.headers['x-oauth-access-token'] === 'string';
  const hasAppleToken = typeof req.headers['x-apple-identity-token'] === 'string';

  return `provider=${providerHeader} bearer=${hasBearer ? 'yes' : 'no'} oauth=${hasGoogleOauth ? 'yes' : 'no'} apple=${hasAppleToken ? 'yes' : 'no'}`;
};

const summarizeUser = (req: MaybeAuthedRequest): string => {
  if (!req.user) {
    return 'anon';
  }
  const provider = req.user.provider || 'unknown';
  const uid = req.user.uid || 'unknown';
  const suffix = uid.length > 8 ? `${uid.slice(0, 4)}…${uid.slice(-4)}` : uid;
  return `${provider}:${suffix}`;
};

const LOCAL_ADDRESS_SET = new Set(['127.0.0.1', '::1']);

const normalizeAddress = (address: string): string => {
  if (!address) {
    return '';
  }
  return address.startsWith('::ffff:') ? address.slice(7) : address;
};

const isLocalRequest = (req: Request): boolean => {
  const hostHeader = req.headers.host?.toLowerCase() ?? '';
  const remoteAddress = normalizeAddress(req.socket.remoteAddress ?? '');
  const clientIp = normalizeAddress(req.ip ?? '');

  if (hostHeader.startsWith('localhost') || hostHeader.startsWith('127.0.0.1')) {
    return true;
  }

  if (LOCAL_ADDRESS_SET.has(remoteAddress) || LOCAL_ADDRESS_SET.has(clientIp)) {
    return true;
  }

  return false;
};

export const devLoggerMiddleware = (): RequestHandler => {
  const shouldLog = process.env.NODE_ENV !== 'production';

  return (req, res, next) => {
    if (!shouldLog || !isLocalRequest(req)) {
      next();
      return;
    }

    const startTime = process.hrtime.bigint();

    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startTime) / 1_000_000;
      const remoteAddress = normalizeAddress(req.socket.remoteAddress ?? '');
      const authSummary = summarizeAuthHeaders(req);
      const userSummary = summarizeUser(req as MaybeAuthedRequest);
      console.log(
        `[dev] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${durationMs.toFixed(2)}ms) from ${remoteAddress || 'unknown'} | auth(${authSummary}) user=${userSummary}`,
      );
    });

    next();
  };
};
