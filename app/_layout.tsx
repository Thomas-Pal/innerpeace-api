import { Stack, usePathname, useRouter, useSegments } from 'expo-router';
import React, { useEffect } from 'react';
import { useAuthStore } from '../src/stores/auth';

// ONE: Layout decides navigation. Screens never redirect.
export default function RootLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const segments = useSegments();

  const { checked, session, initialize } = useAuthStore();

  // Initialize Supabase auth listener once.
  useEffect(() => { void initialize(); }, []);

  // Gate after auth is known. Only navigate when the target differs.
  useEffect(() => {
    if (!checked) return;
    const authed = !!session;

    // treat /login (and optional (auth) group) as auth routes
    const inAuthZone =
      pathname === '/login' || segments[0] === '(auth)';

    if (!authed && !inAuthZone && pathname !== '/login') {
      router.replace('/login');
    } else if (authed && inAuthZone && pathname !== '/') {
      router.replace('/');
    }
  }, [checked, session, pathname, segments, router]);

  // Render the navigator. No Slot. No state changes here.
  return <Stack screenOptions={{ headerShown: false }} />;
}
