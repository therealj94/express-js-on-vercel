// components/CrashScreen.tsx — TEMPORAL, ver utils/crashCatcher.ts
import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';

export function CrashScreen({ message }: { message: string }) {
  return (
    <View style={s.root}>
      <Text style={s.title}>Se detectó un error</Text>
      <Text style={s.hint}>Sacale una foto a esto y mandalo.</Text>
      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent}>
        <Text selectable style={s.text}>{message}</Text>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0A0A0F', paddingTop: 56, paddingHorizontal: 16 },
  title: { color: '#FF3B5C', fontSize: 20, fontWeight: '800', marginBottom: 4 },
  hint: { color: '#8A8A9A', fontSize: 13, marginBottom: 16 },
  scroll: { flex: 1, backgroundColor: '#15151F', borderRadius: 12, padding: 12 },
  scrollContent: { paddingBottom: 40 },
  text: { color: '#E6E6F0', fontSize: 12, fontFamily: 'monospace' },
});
