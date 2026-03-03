const REQUIRED_EXTERNAL_REL_TOKENS = ["noopener", "noreferrer"] as const;
const DATA_URL_PREFIX = "data:";
const ALLOWED_EXTERNAL_PROTOCOLS = new Set(["http:", "https:", "blob:"]);
const BLOCKED_DATA_IMAGE_MIME_TYPES = new Set(["image/svg+xml"]);

export const EXTERNAL_LINK_TARGET = "_blank";

const normalizeRelToken = (token: string): string => token.trim().toLowerCase();

export function buildExternalLinkRel(currentRel?: string): string {
  const extraTokens: string[] = [];
  const seen = new Set<string>(REQUIRED_EXTERNAL_REL_TOKENS);

  for (const rawToken of (currentRel ?? "").split(/\s+/)) {
    const token = normalizeRelToken(rawToken);
    if (!token || seen.has(token)) {
      continue;
    }
    seen.add(token);
    extraTokens.push(token);
  }

  return [...REQUIRED_EXTERNAL_REL_TOKENS, ...extraTokens].join(" ");
}

function hasDataPrefix(url: string): boolean {
  return url.toLowerCase().startsWith(DATA_URL_PREFIX);
}

function isAllowedDataImageUrl(url: string): boolean {
  if (!hasDataPrefix(url)) {
    return false;
  }

  const commaIndex = url.indexOf(",");
  if (commaIndex < DATA_URL_PREFIX.length) {
    return false;
  }

  const metadata = url.slice(DATA_URL_PREFIX.length, commaIndex);
  const mimeType = metadata.split(";")[0]?.trim().toLowerCase() ?? "";
  if (!mimeType.startsWith("image/")) {
    return false;
  }

  return !BLOCKED_DATA_IMAGE_MIME_TYPES.has(mimeType);
}

export type ResolveSafeExternalUrlOptions = {
  allowDataImage?: boolean;
};

export function resolveSafeExternalUrl(
  rawUrl: string,
  baseHref: string,
  opts: ResolveSafeExternalUrlOptions = {},
): string | null {
  const candidate = rawUrl.trim();
  if (!candidate) {
    return null;
  }

  if (opts.allowDataImage === true && isAllowedDataImageUrl(candidate)) {
    return candidate;
  }

  if (hasDataPrefix(candidate)) {
    return null;
  }

  try {
    const parsed = new URL(candidate, baseHref);
    return ALLOWED_EXTERNAL_PROTOCOLS.has(parsed.protocol.toLowerCase())
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

export type OpenExternalUrlSafeOptions = ResolveSafeExternalUrlOptions & {
  baseHref?: string;
};

export function openExternalUrlSafe(
  rawUrl: string,
  opts: OpenExternalUrlSafeOptions = {},
): WindowProxy | null {
  const baseHref = opts.baseHref ?? window.location.href;
  const safeUrl = resolveSafeExternalUrl(rawUrl, baseHref, opts);
  if (!safeUrl) {
    return null;
  }

  const opened = window.open(safeUrl, "_blank", "noopener,noreferrer");
  if (opened) {
    opened.opener = null;
  }
  return opened;
}
