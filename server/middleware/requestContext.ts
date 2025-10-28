import type { RequestHandler } from 'express';

type Provider = 'google' | 'apple' | null;

type IdTokenSource = 'google' | 'apple' | null;

export const readProviderContext: RequestHandler = (req, _res, next) => {
  const ctx = req.ctx || (req.ctx = {});

  const providerHeader = req.get('x-auth-provider');
  ctx.provider = providerHeader ? providerHeader.toLowerCase() : null;

  const hasGoogleId = Boolean(req.get('x-google-id-token'));
  const hasAppleId = Boolean(req.get('x-apple-identity-token'));

  let idSource: IdTokenSource = null;
  if (hasGoogleId) {
    idSource = 'google';
  } else if (hasAppleId) {
    idSource = 'apple';
  }

  ctx.idTokenSource = idSource;

  next();
};

export const requestLogMiddleware: RequestHandler = (req, res, next) => {
  res.on('finish', () => {
    const provider: Provider = (req.ctx?.provider ?? null) as Provider;
    const idTokenSource: IdTokenSource = (req.ctx?.idTokenSource ?? null) as IdTokenSource;
    const entry = {
      path: req.originalUrl,
      provider,
      hasId: Boolean(idTokenSource),
      hasAppJwt: Boolean(req.auth),
    };
    console.log('[req]', entry);
  });

  next();
};
