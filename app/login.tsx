import React, { useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, Alert } from 'react-native';
import { signInWithAppleNative, signInWithGoogleNative } from '../src/auth/native';

export default function Login() {
  const [busy, setBusy] = useState<'google' | 'apple' | null>(null);

  const run = async (provider: 'google' | 'apple') => {
    try {
      setBusy(provider);
      if (provider === 'google') await signInWithGoogleNative();
      else await signInWithAppleNative();
      // Do not navigate here; layout will redirect once session exists.
    } catch (e: any) {
      Alert.alert(
        `${provider === 'google' ? 'Google' : 'Apple'} Sign-In failed`,
        e?.message ?? 'Unknown error'
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: 24 }}>
      <Text style={{ fontSize: 28, textAlign: 'center', marginBottom: 24 }}>InnerPeace</Text>

      <Pressable
        onPress={() => run('google')}
        style={{ padding: 14, borderRadius: 12, backgroundColor: '#fff', marginBottom: 12 }}
      >
        {busy === 'google'
          ? <ActivityIndicator />
          : <Text style={{ textAlign: 'center' }}>Continue with Google</Text>}
      </Pressable>

      <Pressable
        onPress={() => run('apple')}
        style={{ padding: 14, borderRadius: 12, backgroundColor: '#000' }}
      >
        {busy === 'apple'
          ? <ActivityIndicator color="#fff" />
          : <Text style={{ color: '#fff', textAlign: 'center' }}>Sign in with Apple</Text>}
      </Pressable>
    </View>
  );
}
