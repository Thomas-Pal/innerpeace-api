import type { NextFunction, Request, Response } from 'express';
import { jest } from '@jest/globals';

import { createAuthMiddleware } from '../src/middleware/auth.js';

type MockResponse = Response & {
  statusCode: number;
  body: unknown;
};

function createRequest(headers: Record<string, string | undefined>): Request {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === 'string') {
      normalized[key] = value;
      normalized[key.toLowerCase()] = value;
    }
  }
  return {
    headers: normalized,
    get(name: string) {
      return normalized[name] ?? normalized[name.toLowerCase()] ?? undefined;
    },
  } as unknown as Request;
}

function createResponse(): MockResponse {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  } as unknown as MockResponse;

  return res;
}

describe('requireAuth middleware', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns 401 when no JWT is present', async () => {
    const req = createRequest({});
    const res = createResponse();
    const next = jest.fn();

    const middleware = createAuthMiddleware({ verify: jest.fn() });

    await middleware(req, res, next as unknown as NextFunction);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ code: 401, message: 'Missing JWT' });
    expect(next).not.toHaveBeenCalled();
  });

  it('attaches claims when x-app-jwt header is provided', async () => {
    const claims = { sub: 'user-123', email: 'user@example.com' } as any;
    const verifyAppJwtMock = jest.fn().mockResolvedValue(claims);
    const middleware = createAuthMiddleware({ verify: verifyAppJwtMock });

    const req = createRequest({ 'x-app-jwt': 'token-abc123' });
    const res = createResponse();
    const next = jest.fn();

    await middleware(req, res, next as unknown as NextFunction);

    expect(verifyAppJwtMock).toHaveBeenCalledWith('token-abc123');
    expect(req.user).toEqual(claims);
    expect(next).toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
  });

  it('accepts Authorization bearer tokens', async () => {
    const claims = { sub: 'user-456' } as any;
    const verifyAppJwtMock = jest.fn().mockResolvedValue(claims);
    const middleware = createAuthMiddleware({ verify: verifyAppJwtMock });

    const req = createRequest({ Authorization: 'Bearer auth-token' });
    const res = createResponse();
    const next = jest.fn();

    await middleware(req, res, next as unknown as NextFunction);

    expect(verifyAppJwtMock).toHaveBeenCalledWith('auth-token');
    expect(req.user).toEqual(claims);
    expect(next).toHaveBeenCalled();
  });

  it('returns 401 when verification fails', async () => {
    const verifyAppJwtMock = jest.fn().mockRejectedValue(new Error('invalid token'));
    const middleware = createAuthMiddleware({ verify: verifyAppJwtMock });

    const req = createRequest({ 'x-app-jwt': 'bad-token' });
    const res = createResponse();
    const next = jest.fn();

    await middleware(req, res, next as unknown as NextFunction);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ code: 401, message: 'Invalid or expired JWT' });
    expect(req.user).toBeUndefined();
    expect(next).not.toHaveBeenCalled();
  });
});
