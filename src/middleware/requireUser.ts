import type { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';
import { unauthorized } from '../utils/http.js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = (supabaseUrl && supabaseServiceRoleKey)
  ? createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null;

export async function requireUser(req: Request, res: Response, next: NextFunction) {
  try {
    if (!supabase) {
      console.error('[auth] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured');
      return res.status(500).json({ code: 500, message: 'Supabase auth not configured' });
    }

    const hdr = (req.headers.authorization || (req.headers as any).Authorization) as string | undefined;
    if (!hdr || !/^Bearer\s+/i.test(hdr)) {
      return unauthorized(res);
    }

    const token = hdr.replace(/^Bearer\s+/i, '').trim();
    if (!token) {
      return unauthorized(res);
    }

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
      return unauthorized(res);
    }

    (req as any).user = data.user;
    return next();
  } catch (e) {
    console.error('[auth] requireUser failed:', (e as Error)?.message ?? e);
    return unauthorized(res);
  }
}
