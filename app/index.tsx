import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { signOutAll } from '../src/auth/native';
import { apiGetJson } from '../src/lib/api';
import { useAuthStore } from '../src/stores/auth';

type WhoAmIResponse = { ok: boolean; gotAuth: boolean };
type MediaListResponse = { items?: Array<{ id: string; name: string }> };

export default function Home() {
  const { session } = useAuthStore();
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let cancelled = false;

    if (!session) {
      setStatus('idle');
      setMessage('');
      return () => {
        cancelled = true;
      };
    }

    const load = async () => {
      setStatus('loading');
      try {
        const whoami = await apiGetJson<WhoAmIResponse>('/api/debug/whoami');
        const defaultFolder = process.env.EXPO_PUBLIC_MEDIA_FOLDER_ID;
        const query = defaultFolder ? `?folderId=${encodeURIComponent(defaultFolder)}` : '';
        const media = await apiGetJson<MediaListResponse>(`/api/media/list${query}`);

        if (cancelled) return;

        const items = Array.isArray(media.items) ? media.items.length : 0;
        const gotAuth = Boolean(whoami?.gotAuth);
        setStatus('ready');
        setMessage(`Auth header: ${gotAuth ? 'present' : 'missing'} · Media items: ${items}`);
      } catch (error) {
        if (cancelled) return;
        setStatus('error');
        setMessage((error as Error)?.message ?? 'Request failed');
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [session]);

  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: 24 }}>
      <Text style={{ fontSize: 22, textAlign: 'center', marginBottom: 24 }}>
        Welcome to InnerPeace
      </Text>

      <View style={{ minHeight: 40, marginBottom: 24, justifyContent: 'center' }}>
        {status === 'loading' ? (
          <ActivityIndicator />
        ) : status === 'ready' || status === 'error' ? (
          <Text
            style={{
              textAlign: 'center',
              color: status === 'error' ? '#d00' : '#555',
            }}
          >
            {message}
          </Text>
        ) : null}
      </View>

      <Pressable
        onPress={() => signOutAll()}
        style={{ padding: 14, borderRadius: 12, backgroundColor: '#eee' }}
      >
        <Text style={{ textAlign: 'center' }}>Sign out</Text>
      </Pressable>
    </View>
  );
}
