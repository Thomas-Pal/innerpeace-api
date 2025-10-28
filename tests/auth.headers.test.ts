import type { Request } from 'express';
import { readAppJwt } from '../src/auth/headers.js';

type HeaderBag = Record<string, string | undefined>;

function makeRequest(headers: HeaderBag): Request {
  const bag: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === 'string') {
      bag[key] = value;
    }
  }
  return { headers: bag } as unknown as Request;
}

describe('readAppJwt', () => {
  it('reads token from x-app-jwt header first', () => {
    const req = makeRequest({ 'X-App-Jwt': 'token-app-123456' });
    const result = readAppJwt(req);
    expect(result.token).toBe('token-app-123456');
    expect(result.source).toBe('x-app-jwt');
    expect(result.suffix).toBe('…123456');
  });

  it('falls back to x-forwarded-authorization bearer token', () => {
    const req = makeRequest({ 'X-Forwarded-Authorization': 'Bearer forwarded-abcdef' });
    const result = readAppJwt(req);
    expect(result.token).toBe('forwarded-abcdef');
    expect(result.source).toBe('x-forwarded-authorization');
    expect(result.suffix).toBe('…abcdef');
  });

  it('falls back to authorization bearer token', () => {
    const req = makeRequest({ Authorization: 'Bearer original-654321' });
    const result = readAppJwt(req);
    expect(result.token).toBe('original-654321');
    expect(result.source).toBe('authorization');
    expect(result.suffix).toBe('…654321');
  });

  it('returns nulls when no tokens present', () => {
    const req = makeRequest({});
    const result = readAppJwt(req);
    expect(result.token).toBeNull();
    expect(result.source).toBeNull();
    expect(result.suffix).toBeNull();
  });
});
