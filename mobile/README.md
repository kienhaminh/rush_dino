# RushDino Mobile

Expo Router app for the RushDino mobile gateway.

## Scope

- `connect` screen for manual publish-host/API-key entry or QR scan
- `chat` screen for a single RushDino conversation over the mobile gateway WebSocket
- secure local credential restore with `expo-secure-store`

## Run

```bash
npm install
npx expo start
```

## Connect Flow

1. Enable **Mobile Gateway** in the RushDino dashboard.
2. Set the mobile gateway `publish_host`.
3. Issue an API key from the dashboard.
4. Enter the `publish_host` and API key manually, or scan the dashboard QR code.

## Key Files

- `src/app/connect.tsx`
- `src/app/chat.tsx`
- `src/providers/mobile-gateway-provider.tsx`
- `src/lib/mobile-gateway.ts`
