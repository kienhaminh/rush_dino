import * as SecureStore from 'expo-secure-store';

const STORED_CONNECTION_KEY = 'rushdino.mobile.connection.v1';

export type StoredMobileGatewayConnection = {
  host: string;
  apiKey: string;
};

export type MobileGatewayConnectBootstrap = {
  channelId: string;
  senderId: string;
  label?: string | null;
  publishHost: string;
  websocketPath: string;
  conversationId: string;
};

export type MobileGatewayQrPayload = {
  kind: 'rushdino_mobile_connect';
  version: 1;
  host: string;
  apiKey: string;
};

type JsonRecord = Record<string, unknown>;

export class MobileGatewayRequestError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'MobileGatewayRequestError';
    this.status = status;
  }
}

function toMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === 'object') {
    const error = (payload as JsonRecord).error;
    if (typeof error === 'string' && error.trim()) {
      return error;
    }
    const message = (payload as JsonRecord).message;
    if (typeof message === 'string' && message.trim()) {
      return message;
    }
  }
  return fallback;
}

function ensureScheme(value: string) {
  return /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(value) ? value : `https://${value}`;
}

function stripTrailingSlash(value: string) {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

export function normalizeMobileGatewayConnection(
  connection: StoredMobileGatewayConnection,
): StoredMobileGatewayConnection {
  const hostInput = connection.host.trim();
  const apiKey = connection.apiKey.trim();

  if (!hostInput) {
    throw new Error('Publish host is required.');
  }
  if (!apiKey) {
    throw new Error('API key is required.');
  }

  const url = new URL(ensureScheme(hostInput));
  url.pathname = '';
  url.search = '';
  url.hash = '';

  return {
    host: stripTrailingSlash(url.toString()),
    apiKey,
  };
}

export function parseMobileGatewayQrPayload(raw: string): StoredMobileGatewayConnection {
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    throw new Error('The scanned QR code is not valid JSON.');
  }

  if (!payload || typeof payload !== 'object') {
    throw new Error('The scanned QR code is missing RushDino connection data.');
  }

  const record = payload as Partial<MobileGatewayQrPayload>;
  if (record.kind !== 'rushdino_mobile_connect' || record.version !== 1) {
    throw new Error('This QR code is not a RushDino mobile gateway code.');
  }
  if (typeof record.host !== 'string' || typeof record.apiKey !== 'string') {
    throw new Error('The QR code does not include a publish host and API key.');
  }

  return normalizeMobileGatewayConnection({
    host: record.host,
    apiKey: record.apiKey,
  });
}

export function buildMobileGatewayWebSocketUrl(host: string, websocketPath: string) {
  const base = new URL(host);
  base.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
  base.pathname = websocketPath.startsWith('/') ? websocketPath : `/${websocketPath}`;
  base.search = '';
  base.hash = '';
  return base.toString();
}

async function parseJsonResponse(response: Response) {
  const raw = await response.text();
  if (!raw.trim()) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch {
    if (!response.ok) {
      throw new MobileGatewayRequestError(
        `RushDino returned ${response.status} while validating the mobile gateway connection.`,
        response.status,
      );
    }
    throw new Error('RushDino returned invalid JSON.');
  }
}

export async function validateMobileGatewayConnection(
  connection: StoredMobileGatewayConnection,
): Promise<MobileGatewayConnectBootstrap> {
  const normalized = normalizeMobileGatewayConnection(connection);
  const endpoint = `${normalized.host}/api/channels/mobile/connect`;

  const response = await fetch(endpoint, {
    headers: {
      Authorization: `Bearer ${normalized.apiKey}`,
    },
  });

  const payload = await parseJsonResponse(response);
  if (!response.ok) {
    throw new MobileGatewayRequestError(
      toMessage(
        payload,
        `RushDino rejected the mobile gateway connection (${response.status}).`,
      ),
      response.status,
    );
  }

  return payload as MobileGatewayConnectBootstrap;
}

export async function loadStoredMobileGatewayConnection() {
  const raw = await SecureStore.getItemAsync(STORED_CONNECTION_KEY);
  if (!raw) {
    return null;
  }

  try {
    const payload = JSON.parse(raw) as StoredMobileGatewayConnection;
    return normalizeMobileGatewayConnection(payload);
  } catch {
    await SecureStore.deleteItemAsync(STORED_CONNECTION_KEY);
    return null;
  }
}

export async function saveStoredMobileGatewayConnection(
  connection: StoredMobileGatewayConnection,
) {
  await SecureStore.setItemAsync(
    STORED_CONNECTION_KEY,
    JSON.stringify(normalizeMobileGatewayConnection(connection)),
  );
}

export async function clearStoredMobileGatewayConnection() {
  await SecureStore.deleteItemAsync(STORED_CONNECTION_KEY);
}
