import type { Request } from 'express';

let pickSupabaseToken: (req: Request) => string | null;

function buildJwt(payload: Record<string, unknown>) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.signature`;
}

describe('pickSupabaseToken', () => {
  beforeAll(async () => {
    process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role';
    ({ pickSupabaseToken } = await import('../src/middleware/requireAuth.js'));
  });

  it('prefers x-supabase-auth over authorization', () => {
    const supa = buildJwt({ iss: 'https://example.supabase.co/auth/v1' });
    const google = buildJwt({ iss: 'https://accounts.google.com' });
    const req = {
      headers: {
        'x-supabase-auth': `Bearer ${supa}`,
        authorization: `Bearer ${google}`,
      },
    } as unknown as Request;

    expect(pickSupabaseToken(req)).toBe(supa);
  });

  it('falls back to authorization only when iss is supabase', () => {
    const supa = buildJwt({ iss: 'https://project.supabase.co/auth/v1' });
    const req = {
      headers: {
        authorization: `Bearer ${supa}`,
      },
    } as unknown as Request;

    expect(pickSupabaseToken(req)).toBe(supa);
  });

  it('ignores authorization when iss is not supabase', () => {
    const google = buildJwt({ iss: 'https://accounts.google.com' });
    const req = {
      headers: {
        authorization: `Bearer ${google}`,
      },
    } as unknown as Request;

    expect(pickSupabaseToken(req)).toBeNull();
  });
});
