import { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { palette } from '@/constants/palette';
import { useMobileGateway } from '@/providers/mobile-gateway-provider';

function connectionLabel(status: 'booting' | 'connecting' | 'connected' | 'disconnected') {
  switch (status) {
    case 'connected':
      return 'Live';
    case 'connecting':
      return 'Reconnecting';
    case 'booting':
      return 'Starting';
    default:
      return 'Offline';
  }
}

function formatArgs(args?: Record<string, unknown>) {
  if (!args) {
    return 'No arguments';
  }

  try {
    return JSON.stringify(args, null, 2);
  } catch {
    return 'Arguments unavailable';
  }
}

export default function ChatScreen() {
  const router = useRouter();
  const {
    ready,
    status,
    error,
    connection,
    bootstrap,
    messages,
    pendingApproval,
    approvalSubmitting,
    disconnect,
    sendMessage,
    resolveApproval,
    clearError,
  } = useMobileGateway();
  const [composer, setComposer] = useState('');
  const scrollRef = useRef<ScrollView | null>(null);

  useEffect(() => {
    if (ready && !connection) {
      router.replace('/connect');
    }
  }, [connection, ready, router]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [messages]);

  if (!ready) {
    return null;
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.keyboard}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>RushDino</Text>
            <Text style={styles.headerTitle}>Agent Chat</Text>
            <Text style={styles.headerSubtitle}>
              {bootstrap?.publishHost ?? connection?.host ?? 'Waiting for a mobile gateway host'}
            </Text>
          </View>

          <View style={styles.headerActions}>
            <View style={styles.liveBadge}>
              <View
                style={[
                  styles.liveDot,
                  status === 'connected' ? styles.liveDotConnected : styles.liveDotDisconnected,
                ]}
              />
              <Text style={styles.liveText}>{connectionLabel(status)}</Text>
            </View>
            <Pressable
              onPress={disconnect}
              style={({ pressed }) => [styles.disconnectButton, pressed && styles.buttonPressed]}
            >
              <Text style={styles.disconnectButtonText}>Disconnect</Text>
            </Pressable>
          </View>
        </View>

        {error ? (
          <Pressable
            onPress={clearError}
            style={({ pressed }) => [styles.errorCard, pressed && styles.buttonPressed]}
          >
            <Text style={styles.errorTitle}>Connection notice</Text>
            <Text style={styles.errorBody}>{error}</Text>
          </Pressable>
        ) : null}

        <ScrollView
          ref={scrollRef}
          style={styles.messages}
          contentContainerStyle={styles.messagesContent}
          keyboardShouldPersistTaps="handled"
        >
          {messages.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>RushDino is ready.</Text>
              <Text style={styles.emptyBody}>
                Send a message once the status switches to live. This mobile channel keeps a single
                conversation per API key.
              </Text>
            </View>
          ) : null}

          {messages.map((message) => (
            <View
              key={message.id}
              style={[
                styles.messageBubble,
                message.role === 'user'
                  ? styles.userBubble
                  : message.role === 'assistant'
                    ? styles.assistantBubble
                    : styles.systemBubble,
              ]}
            >
              <Text
                style={[
                  styles.messageRole,
                  message.role === 'user' ? styles.userRole : styles.neutralRole,
                ]}
              >
                {message.role === 'user'
                  ? 'You'
                  : message.role === 'assistant'
                    ? 'RushDino'
                    : 'System'}
              </Text>
              <Text
                style={[
                  styles.messageText,
                  message.role === 'user' ? styles.userText : styles.neutralText,
                ]}
              >
                {message.content}
              </Text>
              {message.pending ? <Text style={styles.pendingText}>Streaming…</Text> : null}
            </View>
          ))}
        </ScrollView>

        {pendingApproval ? (
          <View style={styles.approvalCard}>
            <Text style={styles.approvalTitle}>Approval required</Text>
            <Text style={styles.approvalBody}>
              RushDino wants to run <Text style={styles.approvalTool}>{pendingApproval.tool}</Text>
            </Text>
            <Text style={styles.approvalArgs}>{formatArgs(pendingApproval.args)}</Text>

            <View style={styles.approvalActions}>
              <Pressable
                onPress={() => resolveApproval(false)}
                disabled={approvalSubmitting}
                style={({ pressed }) => [
                  styles.approvalButtonSecondary,
                  (pressed || approvalSubmitting) && styles.buttonPressed,
                ]}
              >
                <Text style={styles.approvalButtonSecondaryText}>Deny</Text>
              </Pressable>
              <Pressable
                onPress={() => resolveApproval(true)}
                disabled={approvalSubmitting}
                style={({ pressed }) => [
                  styles.approvalButtonPrimary,
                  (pressed || approvalSubmitting) && styles.buttonPressed,
                ]}
              >
                <Text style={styles.approvalButtonPrimaryText}>
                  {approvalSubmitting ? 'Sending…' : 'Approve'}
                </Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        <View style={styles.composerShell}>
          <TextInput
            multiline
            value={composer}
            onChangeText={setComposer}
            placeholder="Message RushDino"
            placeholderTextColor={palette.mutedInk}
            style={styles.composerInput}
            textAlignVertical="top"
          />
          <Pressable
            onPress={() => {
              if (!composer.trim()) {
                return;
              }
              sendMessage(composer);
              setComposer('');
            }}
            disabled={status !== 'connected' || !composer.trim()}
            style={({ pressed }) => [
              styles.sendButton,
              (pressed || status !== 'connected' || !composer.trim()) && styles.buttonPressed,
            ]}
          >
            <Text style={styles.sendButtonText}>Send</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
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
    paddingHorizontal: 18,
    paddingBottom: 18,
    gap: 14,
  },
  header: {
    marginTop: 6,
    paddingTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 14,
  },
  headerCopy: {
    flex: 1,
    gap: 4,
  },
  eyebrow: {
    color: palette.accentDeep,
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.9,
  },
  headerTitle: {
    color: palette.ink,
    fontSize: 30,
    fontWeight: '800',
  },
  headerSubtitle: {
    color: palette.mutedInk,
    fontSize: 13,
    lineHeight: 18,
  },
  headerActions: {
    alignItems: 'flex-end',
    gap: 10,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 999,
    backgroundColor: palette.paperStrong,
    borderWidth: 1,
    borderColor: palette.line,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  liveDot: {
    height: 8,
    width: 8,
    borderRadius: 999,
  },
  liveDotConnected: {
    backgroundColor: palette.success,
  },
  liveDotDisconnected: {
    backgroundColor: palette.warning,
  },
  liveText: {
    color: palette.ink,
    fontSize: 12,
    fontWeight: '700',
  },
  disconnectButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.paperStrong,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  disconnectButtonText: {
    color: palette.accentDeep,
    fontSize: 13,
    fontWeight: '700',
  },
  errorCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#edc5ba',
    backgroundColor: '#f8e4df',
    padding: 14,
    gap: 6,
  },
  errorTitle: {
    color: palette.danger,
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  errorBody: {
    color: palette.ink,
    fontSize: 14,
    lineHeight: 20,
  },
  messages: {
    flex: 1,
  },
  messagesContent: {
    gap: 12,
    paddingBottom: 14,
  },
  emptyState: {
    borderRadius: 26,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.paperStrong,
    padding: 20,
    gap: 8,
  },
  emptyTitle: {
    color: palette.ink,
    fontSize: 17,
    fontWeight: '800',
  },
  emptyBody: {
    color: palette.mutedInk,
    fontSize: 14,
    lineHeight: 21,
  },
  messageBubble: {
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 6,
    maxWidth: '90%',
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: palette.bubbleUser,
  },
  assistantBubble: {
    alignSelf: 'flex-start',
    backgroundColor: palette.bubbleAssistant,
    borderWidth: 1,
    borderColor: '#e6d8bc',
  },
  systemBubble: {
    alignSelf: 'center',
    backgroundColor: palette.bubbleSystem,
  },
  messageRole: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  userRole: {
    color: '#d8efe6',
  },
  neutralRole: {
    color: palette.mutedInk,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 22,
  },
  userText: {
    color: palette.paperStrong,
  },
  neutralText: {
    color: palette.ink,
  },
  pendingText: {
    color: palette.mutedInk,
    fontSize: 11,
    fontWeight: '700',
  },
  approvalCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#ebd49a',
    backgroundColor: '#fff4d8',
    padding: 16,
    gap: 10,
  },
  approvalTitle: {
    color: palette.ink,
    fontSize: 15,
    fontWeight: '800',
  },
  approvalBody: {
    color: palette.ink,
    fontSize: 14,
    lineHeight: 20,
  },
  approvalTool: {
    fontWeight: '800',
    color: palette.accentDeep,
  },
  approvalArgs: {
    color: palette.mutedInk,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: Platform.select({
      ios: 'Menlo',
      android: 'monospace',
      default: 'monospace',
    }),
  },
  approvalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  approvalButtonSecondary: {
    flex: 1,
    minHeight: 48,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#ddb655',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff8eb',
  },
  approvalButtonSecondaryText: {
    color: palette.ink,
    fontSize: 14,
    fontWeight: '700',
  },
  approvalButtonPrimary: {
    flex: 1,
    minHeight: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.accent,
  },
  approvalButtonPrimaryText: {
    color: palette.paperStrong,
    fontSize: 14,
    fontWeight: '800',
  },
  composerShell: {
    borderRadius: 28,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.paperStrong,
    padding: 12,
    gap: 12,
  },
  composerInput: {
    minHeight: 92,
    maxHeight: 180,
    color: palette.ink,
    fontSize: 15,
    lineHeight: 22,
  },
  sendButton: {
    minHeight: 50,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.accent,
  },
  sendButtonText: {
    color: palette.paperStrong,
    fontSize: 15,
    fontWeight: '800',
  },
  buttonPressed: {
    opacity: 0.7,
  },
});
