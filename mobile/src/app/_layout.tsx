import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { palette } from '@/constants/palette';
import { MobileGatewayProvider } from '@/providers/mobile-gateway-provider';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <MobileGatewayProvider>
          <StatusBar style="dark" />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: {
                backgroundColor: palette.paper,
              },
            }}
          >
            <Stack.Screen name="index" />
            <Stack.Screen name="connect" />
            <Stack.Screen name="chat" />
          </Stack>
        </MobileGatewayProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
