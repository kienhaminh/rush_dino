export type AssistantIdentity = {
  agentId?: string | null;
  name: string;
  avatar: string | null;
};

export const DEFAULT_ASSISTANT_NAME = "Assistant";
export const DEFAULT_ASSISTANT_AVATAR = "A";

const MAX_ASSISTANT_NAME = 50;
const MAX_ASSISTANT_AVATAR = 200;

function coerceIdentityValue(
  value: string | undefined,
  maxLength: number,
): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  return trimmed.slice(0, maxLength);
}

export function normalizeAssistantIdentity(
  input?: Partial<AssistantIdentity> | null,
): AssistantIdentity {
  const name =
    coerceIdentityValue(input?.name, MAX_ASSISTANT_NAME) ??
    DEFAULT_ASSISTANT_NAME;
  const avatar =
    coerceIdentityValue(input?.avatar ?? undefined, MAX_ASSISTANT_AVATAR) ??
    null;
  const agentId =
    typeof input?.agentId === "string" && input.agentId.trim()
      ? input.agentId.trim()
      : null;
  return { agentId, name, avatar };
}

export type CryptoLike = {
  randomUUID?: (() => string) | undefined;
  getRandomValues?: (<T extends Exclude<BufferSource, ArrayBuffer>>(array: T) => T) | undefined;
};

const UUID_BYTE_LENGTH = 16;
let warnedWeakCrypto = false;

function uuidFromBytes(bytes: Uint8Array): string {
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 1

  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(
    16,
    20,
  )}-${hex.slice(20)}`;
}

function weakRandomBytes(): Uint8Array {
  const bytes = new Uint8Array(UUID_BYTE_LENGTH);
  const now = Date.now();
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[0] ^= now & 0xff;
  bytes[1] ^= (now >>> 8) & 0xff;
  bytes[2] ^= (now >>> 16) & 0xff;
  bytes[3] ^= (now >>> 24) & 0xff;
  return bytes;
}

function warnWeakCryptoOnce() {
  if (warnedWeakCrypto) {
    return;
  }
  warnedWeakCrypto = true;
  console.warn("[uuid] crypto API missing; falling back to weak randomness");
}

export function generateUUID(
  cryptoLike: CryptoLike | null = globalThis.crypto,
): string {
  if (cryptoLike && typeof cryptoLike.randomUUID === "function") {
    return cryptoLike.randomUUID();
  }

  if (cryptoLike && typeof cryptoLike.getRandomValues === "function") {
    const bytes = new Uint8Array(UUID_BYTE_LENGTH);
    cryptoLike.getRandomValues(bytes);
    return uuidFromBytes(bytes);
  }

  warnWeakCryptoOnce();
  return uuidFromBytes(weakRandomBytes());
}
