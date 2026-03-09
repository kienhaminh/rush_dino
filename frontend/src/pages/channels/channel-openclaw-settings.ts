import type { ChannelKey } from './ChannelsPage';

export type ChannelSettingFieldType =
  | 'text'
  | 'secret'
  | 'number'
  | 'boolean'
  | 'select'
  | 'textarea'
  | 'list';

export type ChannelSettingField = {
  key: string;
  label: string;
  section: string;
  type: ChannelSettingFieldType;
  description?: string;
  placeholder?: string;
  options?: Array<{ label: string; value: string }>;
};

const DM_POLICY_OPTIONS_WITH_PAIRING = [
  { label: 'Pairing', value: 'pairing' },
  { label: 'Allow list', value: 'allowlist' },
  { label: 'Open', value: 'open' },
  { label: 'Disabled', value: 'disabled' },
];

const DM_POLICY_OPTIONS_STANDARD = [
  { label: 'Allow list', value: 'allowlist' },
  { label: 'Open', value: 'open' },
  { label: 'Disabled', value: 'disabled' },
];

const GROUP_POLICY_OPTIONS = [
  { label: 'Open', value: 'open' },
  { label: 'Allow list', value: 'allowlist' },
  { label: 'Disabled', value: 'disabled' },
];

const CHUNK_MODE_OPTIONS = [
  { label: 'Length', value: 'length' },
  { label: 'Newline', value: 'newline' },
];

const STREAMING_OPTIONS = [
  { label: 'Off', value: 'off' },
  { label: 'Partial', value: 'partial' },
  { label: 'Block', value: 'block' },
  { label: 'Progress', value: 'progress' },
];

const REPLY_TO_MODE_OPTIONS = [
  { label: 'Off', value: 'off' },
  { label: 'First', value: 'first' },
  { label: 'All', value: 'all' },
];

export function defaultDmPolicyForChannel(channel: ChannelKey) {
  return channel === 'telegram' || channel === 'discord' ? 'pairing' : 'open';
}

function createCommonAccessFields(
  dmPolicyOptions: Array<{ label: string; value: string }>,
): ChannelSettingField[] {
  return [
    {
      key: 'dmPolicy',
      label: 'DM Policy',
      section: 'Access Control',
      type: 'select',
      options: dmPolicyOptions,
    },
    {
      key: 'allowFrom',
      label: 'Allow List',
      section: 'Access Control',
      type: 'list',
      placeholder: 'IDs / usernames / handles (comma or newline separated)',
    },
    {
      key: 'groupPolicy',
      label: 'Group Policy',
      section: 'Access Control',
      type: 'select',
      options: GROUP_POLICY_OPTIONS,
    },
    {
      key: 'groupAllowFrom',
      label: 'Group Allow List',
      section: 'Access Control',
      type: 'list',
      placeholder: 'Group sender allow list',
    },
    {
      key: 'defaultTo',
      label: 'Default Delivery Target',
      section: 'Access Control',
      type: 'text',
      placeholder: 'Default target when no explicit reply target is provided',
    },
  ];
}

const PAIRING_ACCESS_FIELDS = createCommonAccessFields(DM_POLICY_OPTIONS_WITH_PAIRING);
const STANDARD_ACCESS_FIELDS = createCommonAccessFields(DM_POLICY_OPTIONS_STANDARD);

const COMMON_MESSAGE_FIELDS: ChannelSettingField[] = [
  {
    key: 'historyLimit',
    label: 'Group History Limit',
    section: 'Message Handling',
    type: 'number',
    placeholder: '0 to disable',
  },
  {
    key: 'dmHistoryLimit',
    label: 'DM History Limit',
    section: 'Message Handling',
    type: 'number',
  },
  {
    key: 'textChunkLimit',
    label: 'Text Chunk Limit',
    section: 'Message Handling',
    type: 'number',
  },
  {
    key: 'chunkMode',
    label: 'Chunk Mode',
    section: 'Message Handling',
    type: 'select',
    options: CHUNK_MODE_OPTIONS,
  },
  {
    key: 'streaming',
    label: 'Streaming Mode',
    section: 'Message Handling',
    type: 'select',
    options: STREAMING_OPTIONS,
  },
  {
    key: 'blockStreaming',
    label: 'Disable Block Streaming',
    section: 'Message Handling',
    type: 'boolean',
  },
  {
    key: 'mediaMaxMb',
    label: 'Max Media Size (MB)',
    section: 'Message Handling',
    type: 'number',
  },
  {
    key: 'responsePrefix',
    label: 'Response Prefix',
    section: 'Message Handling',
    type: 'text',
  },
  {
    key: 'ackReaction',
    label: 'Ack Reaction',
    section: 'Message Handling',
    type: 'text',
  },
];

const TELEGRAM_FIELDS: ChannelSettingField[] = [
  {
    key: 'telegramBotToken',
    label: 'Bot Token',
    section: 'Connection',
    type: 'secret',
    placeholder: '123456:ABC...',
  },
  { key: 'proxy', label: 'Proxy URL', section: 'Connection', type: 'text' },
  {
    key: 'dmPolicy',
    label: 'DM Policy',
    section: 'Access Control',
    type: 'select',
    options: DM_POLICY_OPTIONS_WITH_PAIRING,
  },
  {
    key: 'allowFrom',
    label: 'Allow List',
    section: 'Access Control',
    type: 'list',
    placeholder: 'IDs / usernames / handles (comma or newline separated)',
  },
  {
    key: 'groupPolicy',
    label: 'Group Policy',
    section: 'Access Control',
    type: 'select',
    options: GROUP_POLICY_OPTIONS,
  },
  {
    key: 'historyLimit',
    label: 'Group History Limit',
    section: 'Message Handling',
    type: 'number',
    placeholder: '0 to disable',
  },
  {
    key: 'textChunkLimit',
    label: 'Text Chunk Limit',
    section: 'Message Handling',
    type: 'number',
  },
  {
    key: 'streaming',
    label: 'Streaming Mode',
    section: 'Message Handling',
    type: 'select',
    options: STREAMING_OPTIONS,
  },
  {
    key: 'nativeStreaming',
    label: 'Native Draft Streaming',
    section: 'Message Handling',
    type: 'boolean',
    description: 'Stream direct-message replies as Telegram draft previews when supported.',
  },
  {
    key: 'replyToMode',
    label: 'Reply To Mode',
    section: 'Message Handling',
    type: 'select',
    options: REPLY_TO_MODE_OPTIONS,
  },
  {
    key: 'reactionNotifications',
    label: 'Reaction Notifications',
    section: 'Message Handling',
    type: 'select',
    options: [
      { label: 'Off', value: 'off' },
      { label: 'Own', value: 'own' },
      { label: 'All', value: 'all' },
    ],
  },
  {
    key: 'reactionLevel',
    label: 'Reaction Level',
    section: 'Message Handling',
    type: 'select',
    options: [
      { label: 'Off', value: 'off' },
      { label: 'Ack', value: 'ack' },
      { label: 'Minimal', value: 'minimal' },
      { label: 'Extensive', value: 'extensive' },
    ],
  },
  { key: 'linkPreview', label: 'Enable Link Preview', section: 'Message Handling', type: 'boolean' },
];

const DISCORD_FIELDS: ChannelSettingField[] = [
  {
    key: 'discordBotToken',
    label: 'Bot Token',
    section: 'Connection',
    type: 'secret',
    placeholder: 'Discord bot token',
  },
  { key: 'allowBots', label: 'Allow Bot Messages', section: 'Access Control', type: 'boolean' },
  {
    key: 'dmPolicy',
    label: 'DM Policy',
    section: 'Access Control',
    type: 'select',
    options: DM_POLICY_OPTIONS_WITH_PAIRING,
  },
  {
    key: 'allowFrom',
    label: 'Allow List',
    section: 'Access Control',
    type: 'list',
    placeholder: 'IDs / usernames / handles (comma or newline separated)',
  },
  {
    key: 'groupPolicy',
    label: 'Group Policy',
    section: 'Access Control',
    type: 'select',
    options: GROUP_POLICY_OPTIONS,
  },
  {
    key: 'historyLimit',
    label: 'Group History Limit',
    section: 'Message Handling',
    type: 'number',
    placeholder: '0 to disable',
  },
  {
    key: 'textChunkLimit',
    label: 'Text Chunk Limit',
    section: 'Message Handling',
    type: 'number',
  },
  {
    key: 'streaming',
    label: 'Streaming Mode',
    section: 'Message Handling',
    type: 'select',
    options: STREAMING_OPTIONS,
  },
  {
    key: 'replyToMode',
    label: 'Reply To Mode',
    section: 'Message Handling',
    type: 'select',
    options: REPLY_TO_MODE_OPTIONS,
  },
  {
    key: 'maxLinesPerMessage',
    label: 'Max Lines Per Message',
    section: 'Message Handling',
    type: 'number',
  },
];

const SLACK_FIELDS: ChannelSettingField[] = [
  {
    key: 'slackBotToken',
    label: 'Bot Token',
    section: 'Connection',
    type: 'secret',
    placeholder: 'xoxb-...',
  },
  {
    key: 'slackAppToken',
    label: 'App Token',
    section: 'Connection',
    type: 'secret',
    placeholder: 'xapp-...',
  },
  { key: 'signingSecret', label: 'Signing Secret', section: 'Connection', type: 'secret' },
  {
    key: 'mode',
    label: 'Connection Mode',
    section: 'Connection',
    type: 'select',
    options: [
      { label: 'Socket', value: 'socket' },
      { label: 'HTTP', value: 'http' },
    ],
  },
  { key: 'webhookPath', label: 'Webhook Path', section: 'Connection', type: 'text' },
  { key: 'allowBots', label: 'Allow Bot Messages', section: 'Access Control', type: 'boolean' },
  { key: 'requireMention', label: 'Require Mention', section: 'Access Control', type: 'boolean' },
  {
    key: 'dmPolicy',
    label: 'DM Policy',
    section: 'Access Control',
    type: 'select',
    options: DM_POLICY_OPTIONS_STANDARD,
  },
  {
    key: 'allowFrom',
    label: 'Allow List',
    section: 'Access Control',
    type: 'list',
    placeholder: 'IDs / usernames / handles (comma or newline separated)',
  },
  {
    key: 'groupPolicy',
    label: 'Group Policy',
    section: 'Access Control',
    type: 'select',
    options: GROUP_POLICY_OPTIONS,
  },
  {
    key: 'historyLimit',
    label: 'Group History Limit',
    section: 'Message Handling',
    type: 'number',
    placeholder: '0 to disable',
  },
  {
    key: 'textChunkLimit',
    label: 'Text Chunk Limit',
    section: 'Message Handling',
    type: 'number',
  },
  {
    key: 'streaming',
    label: 'Streaming Mode',
    section: 'Message Handling',
    type: 'select',
    options: STREAMING_OPTIONS,
  },
  {
    key: 'replyToMode',
    label: 'Reply To Mode',
    section: 'Message Handling',
    type: 'select',
    options: REPLY_TO_MODE_OPTIONS,
  },
  { key: 'nativeStreaming', label: 'Use Native Streaming API', section: 'Message Handling', type: 'boolean' },
  {
    key: 'reactionNotifications',
    label: 'Reaction Notifications',
    section: 'Message Handling',
    type: 'select',
    options: [
      { label: 'Off', value: 'off' },
      { label: 'Own', value: 'own' },
      { label: 'All', value: 'all' },
      { label: 'Allow list', value: 'allowlist' },
    ],
  },
];

const WHATSAPP_FIELDS: ChannelSettingField[] = [
  { key: 'selfChatMode', label: 'Same Phone (Self Chat) Mode', section: 'Connection', type: 'boolean' },
  { key: 'authDir', label: 'Auth Directory', section: 'Connection', type: 'text' },
  { key: 'sendReadReceipts', label: 'Send Read Receipts', section: 'Message Handling', type: 'boolean' },
  { key: 'messagePrefix', label: 'Inbound Message Prefix', section: 'Message Handling', type: 'text' },
  { key: 'debounceMs', label: 'Debounce (ms)', section: 'Message Handling', type: 'number' },
  ...STANDARD_ACCESS_FIELDS,
  ...COMMON_MESSAGE_FIELDS,
  { key: 'ackReaction.emoji', label: 'Ack Emoji', section: 'Reactions', type: 'text' },
  { key: 'ackReaction.direct', label: 'Ack in Direct Chats', section: 'Reactions', type: 'boolean' },
  {
    key: 'ackReaction.group',
    label: 'Ack in Group Chats',
    section: 'Reactions',
    type: 'select',
    options: [
      { label: 'Always', value: 'always' },
      { label: 'Mentions Only', value: 'mentions' },
      { label: 'Never', value: 'never' },
    ],
  },
  { key: 'actions.reactions', label: 'Allow Reactions', section: 'Actions', type: 'boolean' },
  { key: 'actions.sendMessage', label: 'Allow Send Message', section: 'Actions', type: 'boolean' },
  { key: 'actions.polls', label: 'Allow Polls', section: 'Actions', type: 'boolean' },
];

const GOOGLE_CHAT_FIELDS: ChannelSettingField[] = [
  { key: 'allowBots', label: 'Allow Bot Messages', section: 'Access Control', type: 'boolean' },
  { key: 'requireMention', label: 'Require Mention', section: 'Access Control', type: 'boolean' },
  ...STANDARD_ACCESS_FIELDS,
  ...COMMON_MESSAGE_FIELDS,
  {
    key: 'replyToMode',
    label: 'Reply To Mode',
    section: 'Message Handling',
    type: 'select',
    options: REPLY_TO_MODE_OPTIONS,
  },
  {
    key: 'typingIndicator',
    label: 'Typing Indicator',
    section: 'Message Handling',
    type: 'select',
    options: [
      { label: 'None', value: 'none' },
      { label: 'Message', value: 'message' },
      { label: 'Reaction', value: 'reaction' },
    ],
  },
  {
    key: 'serviceAccount',
    label: 'Service Account JSON',
    section: 'Connection',
    type: 'textarea',
    placeholder: 'Paste service account JSON or secret reference payload',
  },
  { key: 'serviceAccountRef', label: 'Service Account Secret Ref', section: 'Connection', type: 'text' },
  { key: 'serviceAccountFile', label: 'Service Account File', section: 'Connection', type: 'text' },
  {
    key: 'audienceType',
    label: 'Audience Type',
    section: 'Connection',
    type: 'select',
    options: [
      { label: 'App URL', value: 'app-url' },
      { label: 'Project Number', value: 'project-number' },
    ],
  },
  { key: 'audience', label: 'Audience Value', section: 'Connection', type: 'text' },
  { key: 'webhookPath', label: 'Webhook Path', section: 'Connection', type: 'text' },
  { key: 'webhookUrl', label: 'Webhook URL', section: 'Connection', type: 'text' },
  { key: 'botUser', label: 'Bot User Resource', section: 'Connection', type: 'text' },
  { key: 'actions.reactions', label: 'Allow Reactions', section: 'Actions', type: 'boolean' },
];

const SIGNAL_FIELDS: ChannelSettingField[] = [
  { key: 'account', label: 'Account (E.164)', section: 'Connection', type: 'text' },
  { key: 'accountUuid', label: 'Account UUID', section: 'Connection', type: 'text' },
  { key: 'httpUrl', label: 'Signal HTTP URL', section: 'Connection', type: 'text' },
  { key: 'httpHost', label: 'Signal HTTP Host', section: 'Connection', type: 'text' },
  { key: 'httpPort', label: 'Signal HTTP Port', section: 'Connection', type: 'number' },
  { key: 'cliPath', label: 'signal-cli Path', section: 'Connection', type: 'text' },
  { key: 'autoStart', label: 'Auto Start Daemon', section: 'Connection', type: 'boolean' },
  { key: 'startupTimeoutMs', label: 'Startup Timeout (ms)', section: 'Connection', type: 'number' },
  {
    key: 'receiveMode',
    label: 'Receive Mode',
    section: 'Connection',
    type: 'select',
    options: [
      { label: 'On Start', value: 'on-start' },
      { label: 'Manual', value: 'manual' },
    ],
  },
  { key: 'ignoreAttachments', label: 'Ignore Attachments', section: 'Message Handling', type: 'boolean' },
  { key: 'ignoreStories', label: 'Ignore Stories', section: 'Message Handling', type: 'boolean' },
  { key: 'sendReadReceipts', label: 'Send Read Receipts', section: 'Message Handling', type: 'boolean' },
  ...STANDARD_ACCESS_FIELDS,
  ...COMMON_MESSAGE_FIELDS,
  {
    key: 'reactionNotifications',
    label: 'Reaction Notifications',
    section: 'Message Handling',
    type: 'select',
    options: [
      { label: 'Off', value: 'off' },
      { label: 'Own', value: 'own' },
      { label: 'All', value: 'all' },
      { label: 'Allow list', value: 'allowlist' },
    ],
  },
  { key: 'reactionAllowlist', label: 'Reaction Notification Allow List', section: 'Message Handling', type: 'list' },
  {
    key: 'reactionLevel',
    label: 'Reaction Level',
    section: 'Message Handling',
    type: 'select',
    options: [
      { label: 'Off', value: 'off' },
      { label: 'Ack', value: 'ack' },
      { label: 'Minimal', value: 'minimal' },
      { label: 'Extensive', value: 'extensive' },
    ],
  },
  { key: 'actions.reactions', label: 'Allow Reactions', section: 'Actions', type: 'boolean' },
];

const IMESSAGE_FIELDS: ChannelSettingField[] = [
  { key: 'cliPath', label: 'imsg Path', section: 'Connection', type: 'text' },
  { key: 'dbPath', label: 'Messages DB Path', section: 'Connection', type: 'text' },
  { key: 'remoteHost', label: 'Remote Host', section: 'Connection', type: 'text' },
  {
    key: 'service',
    label: 'Send Service',
    section: 'Connection',
    type: 'select',
    options: [
      { label: 'Auto', value: 'auto' },
      { label: 'iMessage', value: 'imessage' },
      { label: 'SMS', value: 'sms' },
    ],
  },
  { key: 'region', label: 'Region', section: 'Connection', type: 'text' },
  { key: 'includeAttachments', label: 'Include Attachments/Reactions', section: 'Message Handling', type: 'boolean' },
  {
    key: 'attachmentRoots',
    label: 'Attachment Roots',
    section: 'Message Handling',
    type: 'list',
    placeholder: 'Allowed local attachment roots',
  },
  {
    key: 'remoteAttachmentRoots',
    label: 'Remote Attachment Roots',
    section: 'Message Handling',
    type: 'list',
    placeholder: 'Allowed remote attachment roots',
  },
  { key: 'probeTimeoutMs', label: 'Probe Timeout (ms)', section: 'Connection', type: 'number' },
  ...STANDARD_ACCESS_FIELDS,
  ...COMMON_MESSAGE_FIELDS,
];

const NOSTR_FIELDS: ChannelSettingField[] = [
  { key: 'privateKey', label: 'Private Key', section: 'Connection', type: 'secret' },
  { key: 'relays', label: 'Relay URLs', section: 'Connection', type: 'list' },
  ...STANDARD_ACCESS_FIELDS,
  {
    key: 'profile.name',
    label: 'Profile Name',
    section: 'Profile',
    type: 'text',
  },
  {
    key: 'profile.displayName',
    label: 'Profile Display Name',
    section: 'Profile',
    type: 'text',
  },
  {
    key: 'profile.about',
    label: 'Profile About',
    section: 'Profile',
    type: 'textarea',
  },
  { key: 'profile.picture', label: 'Profile Picture URL', section: 'Profile', type: 'text' },
  { key: 'profile.banner', label: 'Profile Banner URL', section: 'Profile', type: 'text' },
  { key: 'profile.website', label: 'Profile Website', section: 'Profile', type: 'text' },
  { key: 'profile.nip05', label: 'NIP-05', section: 'Profile', type: 'text' },
  { key: 'profile.lud16', label: 'LUD16', section: 'Profile', type: 'text' },
  ...COMMON_MESSAGE_FIELDS,
];

const CHANNEL_SETTINGS_FIELDS: Record<ChannelKey, ChannelSettingField[]> = {
  telegram: TELEGRAM_FIELDS,
  discord: DISCORD_FIELDS,
  slack: SLACK_FIELDS,
  whatsapp: WHATSAPP_FIELDS,
  googlechat: GOOGLE_CHAT_FIELDS,
  signal: SIGNAL_FIELDS,
  imessage: IMESSAGE_FIELDS,
  nostr: NOSTR_FIELDS,
};

export function channelTitle(channel: ChannelKey): string {
  return channel === 'googlechat' ? 'Google Chat' : channel.charAt(0).toUpperCase() + channel.slice(1);
}

export function getOpenClawChannelFields(channel: ChannelKey): ChannelSettingField[] {
  return CHANNEL_SETTINGS_FIELDS[channel] ?? [];
}
