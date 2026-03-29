import { useEffect, useEffectEvent, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { useRouter } from 'expo-router';

import { palette } from '@/constants/palette';
import { parseMobileGatewayQrPayload } from '@/lib/mobile-gateway';
import { useMobileGateway } from '@/providers/mobile-gateway-provider';

function statusLabel(status: 'booting' | 'connecting' | 'connected' | 'disconnected') {
  switch (status) {
    case 'connecting':
      return 'Connecting';
    case 'connected':
      return 'Connected';
    case 'booting':
      return 'Starting';
    default:
      return 'Waiting';
  }
}

export default function ConnectScreen() {
  const router = useRouter();
  const {
    ready,
    status,
    error,
    connection,
    bootstrap,
    connect,
    clearError,
  } = useMobileGateway();
  const [host, setHost] = useState(connection?.host ?? '');
  const [apiKey, setApiKey] = useState(connection?.apiKey ?? '');
  const [scannerVisible, setScannerVisible] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const scannerLockedRef = useRef(false);
  const [permission, requestPermission] = useCameraPermissions();

  useEffect(() => {
    if (ready && connection && bootstrap) {
      router.replace('/chat');
    }
  }, [bootstrap, connection, ready, router]);

  const handleBarcodeScanned = useEffectEvent(async (result: BarcodeScanningResult) => {
    if (scannerLockedRef.current) {
      return;
    }

    scannerLockedRef.current = true;
    setScannerError(null);

    try {
      const parsed = parseMobileGatewayQrPayload(result.data);
      setHost(parsed.host);
      setApiKey(parsed.apiKey);
      setScannerVisible(false);
      const didConnect = await connect(parsed);
      if (!didConnect) {
        scannerLockedRef.current = false;
      }
    } catch (scanIssue) {
      scannerLockedRef.current = false;
      setScannerError(
        scanIssue instanceof Error
          ? scanIssue.message
          : 'The scanned QR code is not a RushDino mobile gateway code.',
      );
    }
  });

  const openScanner = async () => {
    clearError();
    setScannerError(null);

    if (!permission?.granted) {
      const nextPermission = await requestPermission();
      if (!nextPermission.granted) {
        setScannerError('Camera permission is required to scan a RushDino QR code.');
        return;
      }
    }

    scannerLockedRef.current = false;
    setScannerVisible(true);
  };

  const submit = async () => {
    clearError();
    await connect({
      host,
      apiKey,
    });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View pointerEvents="none" style={styles.backgroundOrbOne} />
      <View pointerEvents="none" style={styles.backgroundOrbTwo} />

      <KeyboardAvoidingView
        style={styles.keyboard}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.hero}>
            <Text style={styles.kicker}>RushDino</Text>
            <Text style={styles.title}>Mobile Gateway</Text>
            <Text style={styles.subtitle}>
              Connect this device to RushDino over your Tailscale publish host, then chat in a
              single secure thread.
            </Text>
          </View>

          <View style={styles.surface}>
            <View style={styles.statusRow}>
              <View style={styles.statusBadge}>
                <View style={styles.statusDot} />
                <Text style={styles.statusText}>{statusLabel(status)}</Text>
              </View>
              <Text style={styles.statusHint}>Manual entry or QR bootstrap</Text>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Publish Host</Text>
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                placeholder="https://rushdino.tailnet.ts.net"
                placeholderTextColor={palette.mutedInk}
                value={host}
                onChangeText={setHost}
                style={styles.input}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>API Key</Text>
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
                placeholder="mobile_xxxxx"
                placeholderTextColor={palette.mutedInk}
                value={apiKey}
                onChangeText={setApiKey}
                style={styles.input}
              />
            </View>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            {scannerError ? <Text style={styles.errorText}>{scannerError}</Text> : null}

            <Pressable
              onPress={submit}
              disabled={status === 'connecting' || !host.trim() || !apiKey.trim()}
              style={({ pressed }) => [
                styles.primaryButton,
                (pressed || status === 'connecting' || !host.trim() || !apiKey.trim()) &&
                  styles.primaryButtonPressed,
              ]}
            >
              {status === 'connecting' ? (
                <ActivityIndicator color={palette.paperStrong} />
              ) : (
                <Text style={styles.primaryButtonText}>Connect to RushDino</Text>
              )}
            </Pressable>

            <Pressable onPress={openScanner} style={({ pressed }) => [styles.secondaryButton, pressed && styles.secondaryButtonPressed]}>
              <Text style={styles.secondaryButtonText}>Scan QR Code Instead</Text>
            </Pressable>

            <View style={styles.noteCard}>
              <Text style={styles.noteTitle}>What the QR code contains</Text>
              <Text style={styles.noteBody}>
                The same publish host and API key shown above. RushDino never asks for a session id
                in this mobile flow.
              </Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        animationType="slide"
        presentationStyle="pageSheet"
        visible={scannerVisible}
        onRequestClose={() => setScannerVisible(false)}
      >
        <SafeAreaView style={styles.modalSafeArea}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Scan RushDino QR</Text>
            <Pressable onPress={() => setScannerVisible(false)}>
              <Text style={styles.modalClose}>Close</Text>
            </Pressable>
          </View>

          <View style={styles.cameraFrame}>
            <CameraView
              style={styles.camera}
              facing="back"
              barcodeScannerSettings={{
                barcodeTypes: ['qr'],
              }}
              onBarcodeScanned={handleBarcodeScanned}
            />
          </View>

          <Text style={styles.modalHint}>
            Point the camera at a RushDino mobile gateway QR code from the dashboard.
          </Text>
          {scannerError ? <Text style={styles.errorText}>{scannerError}</Text> : null}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: palette.paper,
  },
  keyboard: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 32,
    paddingTop: 18,
    gap: 22,
  },
  backgroundOrbOne: {
    position: 'absolute',
    top: -40,
    right: -20,
    height: 220,
    width: 220,
    borderRadius: 999,
    backgroundColor: '#f1c6b6',
    opacity: 0.65,
  },
  backgroundOrbTwo: {
    position: 'absolute',
    bottom: 70,
    left: -50,
    height: 200,
    width: 200,
    borderRadius: 999,
    backgroundColor: '#d7e8dc',
    opacity: 0.8,
  },
  hero: {
    gap: 8,
    paddingTop: 10,
  },
  kicker: {
    color: palette.accentDeep,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  title: {
    color: palette.ink,
    fontSize: 42,
    fontWeight: '800',
    lineHeight: 44,
  },
  subtitle: {
    color: palette.mutedInk,
    fontSize: 16,
    lineHeight: 24,
    maxWidth: 320,
  },
  surface: {
    borderRadius: 28,
    backgroundColor: 'rgba(255, 249, 240, 0.92)',
    padding: 20,
    gap: 16,
    borderWidth: 1,
    borderColor: palette.line,
    shadowColor: '#1f1b16',
    shadowOpacity: 0.08,
    shadowRadius: 24,
    shadowOffset: {
      width: 0,
      height: 14,
    },
    elevation: 6,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 999,
    backgroundColor: palette.mossSoft,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  statusDot: {
    height: 8,
    width: 8,
    borderRadius: 999,
    backgroundColor: palette.success,
  },
  statusText: {
    color: palette.moss,
    fontSize: 13,
    fontWeight: '700',
  },
  statusHint: {
    color: palette.mutedInk,
    fontSize: 12,
    fontWeight: '600',
  },
  fieldGroup: {
    gap: 8,
  },
  label: {
    color: palette.ink,
    fontSize: 13,
    fontWeight: '700',
  },
  input: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.paperStrong,
    color: palette.ink,
    fontSize: 15,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  errorText: {
    color: palette.danger,
    fontSize: 13,
    lineHeight: 20,
  },
  primaryButton: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: palette.accent,
    minHeight: 52,
  },
  primaryButtonPressed: {
    opacity: 0.7,
  },
  primaryButtonText: {
    color: palette.paperStrong,
    fontSize: 15,
    fontWeight: '800',
  },
  secondaryButton: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: '#f8f1e6',
    minHeight: 52,
  },
  secondaryButtonPressed: {
    opacity: 0.7,
  },
  secondaryButtonText: {
    color: palette.ink,
    fontSize: 14,
    fontWeight: '700',
  },
  noteCard: {
    gap: 6,
    borderRadius: 20,
    backgroundColor: palette.bubbleSystem,
    padding: 16,
  },
  noteTitle: {
    color: palette.ink,
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  noteBody: {
    color: palette.mutedInk,
    fontSize: 14,
    lineHeight: 21,
  },
  modalSafeArea: {
    flex: 1,
    backgroundColor: palette.paper,
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 18,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: {
    color: palette.ink,
    fontSize: 22,
    fontWeight: '800',
  },
  modalClose: {
    color: palette.accentDeep,
    fontSize: 15,
    fontWeight: '700',
  },
  cameraFrame: {
    overflow: 'hidden',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: palette.line,
    minHeight: 420,
    backgroundColor: '#111',
  },
  camera: {
    flex: 1,
  },
  modalHint: {
    color: palette.mutedInk,
    fontSize: 15,
    lineHeight: 22,
  },
});
