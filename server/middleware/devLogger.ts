import type { Request, RequestHandler } from 'express';

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
      console.log(
        `[dev] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${durationMs.toFixed(2)}ms) from ${remoteAddress || 'unknown'}`,
      );
    });

    next();
  };
};
