// app/(tabs)/_layout.tsx
import React from 'react';
import { Tabs } from 'expo-router';
import { Platform } from 'react-native';
import { colors, font } from '@/theme/tokens';
import { Icon, IconName } from '@/components/Icon';
import { tap } from '@/utils/haptics';
import { t } from '@/utils/i18n';

const tabIcon = (name: IconName) => ({ color }: { color: string }) => <Icon name={name} color={color} size={23} />;

export default function TabsLayout() {
  return (
    <Tabs
      screenListeners={{ tabPress: () => tap() }}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.gold,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarStyle: {
          backgroundColor: colors.bgElevated,
          borderTopWidth: 0.5,
          borderTopColor: colors.border,
          height: Platform.OS === 'ios' ? 88 : 68,
          paddingTop: 8,
          paddingBottom: Platform.OS === 'ios' ? 28 : 10,
        },
        tabBarLabelStyle: { fontSize: font.size.xs, fontWeight: '700' },
      }}
    >
      <Tabs.Screen name="dashboard" options={{ title: t('tabs.home'), tabBarIcon: tabIcon('home') }} />
      <Tabs.Screen name="market" options={{ title: t('tabs.market'), tabBarIcon: tabIcon('candle') }} />
      <Tabs.Screen name="real" options={{ title: t('tabs.real'), tabBarIcon: tabIcon('globe') }} />
      <Tabs.Screen name="portfolio" options={{ title: t('tabs.portfolio'), tabBarIcon: tabIcon('pie') }} />
      <Tabs.Screen name="news" options={{ title: t('tabs.news'), tabBarIcon: tabIcon('news') }} />
      <Tabs.Screen name="wallet" options={{ title: t('tabs.wallet'), tabBarIcon: tabIcon('wallet') }} />
    </Tabs>
  );
}
