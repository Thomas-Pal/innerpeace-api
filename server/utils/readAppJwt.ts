import type { Request } from 'express';
import type { AppJwtHeaderSource, ReadAppJwtResult } from '../../src/auth/headers.js';
import { readAppJwt as readJwtDetails } from '../../src/auth/headers.js';

export type { AppJwtHeaderSource } from '../../src/auth/headers.js';

export function readAppJwtWithSource(req: Request): { token: string | null; source: AppJwtHeaderSource } {
  const { token, source } = readJwtDetails(req);
  return { token, source };
}

export function readAppJwt(req: Request): string | null {
  return readJwtDetails(req).token;
}

export function readAppJwtDetails(req: Request): ReadAppJwtResult {
  return readJwtDetails(req);
}
