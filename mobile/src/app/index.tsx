import { Redirect } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { palette } from '@/constants/palette';
import { useMobileGateway } from '@/providers/mobile-gateway-provider';

export default function IndexScreen() {
  const { ready, connection } = useMobileGateway();

  if (!ready) {
    return (
      <View style={styles.container}>
        <ActivityIndicator color={palette.accent} size="large" />
        <Text style={styles.title}>Waking RushDino Mobile</Text>
        <Text style={styles.subtitle}>Checking for a saved publish host and API key.</Text>
      </View>
    );
  }

  return <Redirect href={connection ? '/chat' : '/connect'} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    backgroundColor: palette.paper,
    paddingHorizontal: 24,
  },
  title: {
    color: palette.ink,
    fontSize: 24,
    fontWeight: '700',
  },
  subtitle: {
    color: palette.mutedInk,
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
});
