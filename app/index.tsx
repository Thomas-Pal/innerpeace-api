import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { signOutAll } from '../src/auth/native';

export default function Home() {
  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: 24 }}>
      <Text style={{ fontSize: 22, textAlign: 'center', marginBottom: 24 }}>
        Welcome to InnerPeace
      </Text>
      <Pressable
        onPress={() => signOutAll()}
        style={{ padding: 14, borderRadius: 12, backgroundColor: '#eee' }}
      >
        <Text style={{ textAlign: 'center' }}>Sign out</Text>
      </Pressable>
    </View>
  );
}
