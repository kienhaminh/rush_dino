export interface MobileGatewayQrPayload {
  kind: string;
  version: number;
  host: string;
  apiKey: string;
}

export interface MobileGatewayKeyRecord {
  id: string;
  senderId: string;
  label?: string | null;
  createdAt: string;
  lastSeenAt?: string | null;
  revokedAt?: string | null;
}

export interface IssuedMobileGatewayKey extends MobileGatewayKeyRecord {
  apiKey: string;
  qrPayload: MobileGatewayQrPayload;
}

export interface ChannelStatusSummary {
  id: string;
  label: string;
  enabled: boolean;
  configured: boolean;
  status: 'healthy' | 'needs_attention' | 'disabled' | string;
  issue?: string | null;
}

export interface ChannelPairingPendingRequest {
  id: string;
  channelId: string;
  senderId: string;
  senderDisplay?: string | null;
  replyTarget: string;
  code: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
}

export interface ChannelPairedUser {
  id: string;
  channelId: string;
  senderId: string;
  senderDisplay?: string | null;
  approvedAt: string;
  lastSeenAt: string;
}

export interface ChannelPairingState {
  channelId: string;
  pending: ChannelPairingPendingRequest[];
  paired: ChannelPairedUser[];
}
