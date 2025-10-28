import type { Request } from 'express';

export type AppJwtHeaderSource = 'x-app-jwt' | 'x-forwarded-authorization' | 'authorization' | null;

function headerValue(req: Request, name: string): string | undefined {
  return (req.headers[name] ?? req.headers[name.toLowerCase()]) as string | undefined;
}

export function readAppJwtWithSource(req: Request): { token: string | null; source: AppJwtHeaderSource } {
  const fromXApp = headerValue(req, 'x-app-jwt');
  if (fromXApp) {
    return { token: fromXApp, source: 'x-app-jwt' };
  }

  const xfwd = headerValue(req, 'x-forwarded-authorization');
  if (xfwd?.toLowerCase().startsWith('bearer ')) {
    return { token: xfwd.slice(7).trim(), source: 'x-forwarded-authorization' };
  }

  const auth = headerValue(req, 'authorization');
  if (auth?.toLowerCase().startsWith('bearer ')) {
    return { token: auth.slice(7).trim(), source: 'authorization' };
  }

  return { token: null, source: null };
}

export function readAppJwt(req: Request): string | null {
  return readAppJwtWithSource(req).token;
}
