import * as Apple from 'expo-apple-authentication';
import * as AuthSession from 'expo-auth-session';
import { supabase } from '../lib/supabase';

const GOOGLE_NATIVE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_NATIVE_CLIENT_ID!;

function nonce(len = 32) {
  const cs = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let s = '';
  for (let i = 0; i < len; i++) s += cs[Math.floor(Math.random() * cs.length)];
  return s;
}

export async function signInWithAppleNative() {
  const rawNonce = nonce();
  const cred = await Apple.signInAsync({
    requestedScopes: [Apple.AppleAuthenticationScope.FULL_NAME, Apple.AppleAuthenticationScope.EMAIL],
    nonce: rawNonce,
  });
  if (!cred.identityToken) throw new Error('No Apple identityToken');
  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: cred.identityToken,
    nonce: rawNonce,
  });
  if (error) throw error;
}

export async function signInWithGoogleNative() {
  const discovery = {
    authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenEndpoint: 'https://oauth2.googleapis.com/token',
  } as const;

  const req = new AuthSession.AuthRequest({
    clientId: GOOGLE_NATIVE_CLIENT_ID,
    responseType: AuthSession.ResponseType.IdToken,
    scopes: ['openid', 'email', 'profile'],
    extraParams: { prompt: 'select_account' },
  });

  await req.makeAuthUrlAsync(discovery);
  const res = await req.promptAsync(discovery, { useProxy: false });
  if (res.type !== 'success' || !res.params.id_token) throw new Error('No Google id_token');

  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'google',
    token: res.params.id_token,
  });
  if (error) throw error;
}

export async function signOutAll() {
  await supabase.auth.signOut();
}
