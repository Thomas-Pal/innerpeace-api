import assert from 'node:assert/strict';
import type { Request } from 'express';
import { readAppJwt } from './readAppJwt.js';

type HeaderBag = Record<string, string | undefined>;

function makeRequest(headers: HeaderBag): Request {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === 'string') {
      normalized[key.toLowerCase()] = value;
    }
  }
  return { headers: normalized } as unknown as Request;
}

{
  const req = makeRequest({ 'x-app-jwt': 'token-123' });
  assert.equal(readAppJwt(req), 'token-123');
}

{
  const req = makeRequest({ 'x-forwarded-authorization': 'Bearer forwarded-token' });
  assert.equal(readAppJwt(req), 'forwarded-token');
}

{
  const req = makeRequest({ authorization: 'Bearer original-token' });
  assert.equal(readAppJwt(req), 'original-token');
}

{
  const req = makeRequest({});
  assert.equal(readAppJwt(req), null);
}

console.log('readAppJwt tests passed');
