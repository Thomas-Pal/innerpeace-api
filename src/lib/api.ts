import { supabase } from './supabase';

const rawBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
if (!rawBaseUrl) {
  console.warn('[api] Missing EXPO_PUBLIC_API_BASE_URL; authenticated calls will fail.');
}

const API_BASE_URL = rawBaseUrl ? rawBaseUrl.replace(/\/+$/, '') : '';

function resolvePath(path: string) {
  if (!API_BASE_URL) {
    throw new Error('EXPO_PUBLIC_API_BASE_URL is not configured.');
  }

  if (!path) {
    throw new Error('Path is required.');
  }

  return `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

export async function apiFetch(path: string, init: RequestInit = {}) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const token = session?.access_token;
  if (!token) {
    throw new Error('No Supabase session found. Please sign in again.');
  }

  const headers = new Headers(init.headers ?? {});
  headers.set('Authorization', `Bearer ${token}`);
  headers.set('x-supabase-auth', `Bearer ${token}`);
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');

  return fetch(resolvePath(path), {
    ...init,
    headers,
  });
}

export async function apiGetJson<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(path, init);
  const text = await response.text();

  let payload: any = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!response.ok) {
    const message =
      payload && typeof payload === 'object' && typeof payload.message === 'string'
        ? payload.message
        : `Request failed (${response.status})`;
    throw new Error(message);
  }

  return payload as T;
}
