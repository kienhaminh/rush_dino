# Telegram Channel Config Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a Telegram detail panel (bot token + allowed chat IDs) that expands inline beneath the Telegram toggle in the Gateway section.

**Architecture:** Three small frontend-only changes: (1) add `allowed_chat_ids` to the TypeScript type, (2) pass `credentials`/`onCredentialsChange` props into the Gateway section from ConfigPage, (3) rewrite the gateway section to render a Telegram-specific detail panel when the toggle is on. No backend changes required — all relevant fields already exist (`CredentialsConfig.telegram_bot_token` and `AppConfig.allowed_chat_ids`).

**Tech Stack:** React, TypeScript, Tailwind CSS, shadcn/ui (Input, Label, Switch, Button already available)

---

### Task 1: Add `allowed_chat_ids` to `AppConfigView`

**Files:**
- Modify: `frontend/src/lib/types.ts`

**Step 1: Add the field**

In `AppConfigView`, add `allowed_chat_ids` between `gateway` and `security`:

```ts
export interface AppConfigView {
  host: string;
  port: number;
  active_provider: ProviderKind;
  ollama: OllamaConfig;
  openai: ProviderModelConfig;
  anthropic: ProviderModelConfig;
  codex: ProviderModelConfig;
  gateway: GatewayConfig;
  allowed_chat_ids: number[];   // ← add this line
  security: SecurityConfig;
  [key: string]: unknown;
}
```

**Step 2: Verify type check passes**

```bash
cd frontend && npm run check:types
```

Expected: no errors.

**Step 3: Commit**

```bash
git add frontend/src/lib/types.ts
git commit -m "feat: add allowed_chat_ids to AppConfigView type"
```

---

### Task 2: Pass credentials props into ConfigSectionGateway

**Files:**
- Modify: `frontend/src/pages/config/ConfigPage.tsx` (line 192-194)
- Modify: `frontend/src/pages/config/config-section-gateway.tsx` (Props interface, line 1-8)

**Step 1: Update the Props interface in config-section-gateway.tsx**

Replace the current Props interface:

```ts
// Before
interface Props {
  config: AppConfigView;
  onChange: (patch: Partial<AppConfigView>) => void;
}

// After
interface Props {
  config: AppConfigView;
  onChange: (patch: Partial<AppConfigView>) => void;
  credentials: CredentialsView;
  onCredentialsChange: (patch: Partial<CredentialsView>) => void;
}
```

Also add the import at the top of `config-section-gateway.tsx`:

```ts
import type { AppConfigView, CredentialsView, GatewayConfig } from '@/lib/types';
```

**Step 2: Pass the new props in ConfigPage.tsx**

Find the gateway render line (around line 192-194):

```tsx
// Before
{activeSection === 'gateway' && (
  <ConfigSectionGateway config={config} onChange={handleConfigChange} />
)}

// After
{activeSection === 'gateway' && (
  <ConfigSectionGateway
    config={config}
    onChange={handleConfigChange}
    credentials={credentials}
    onCredentialsChange={handleCredentialsChange}
  />
)}
```

**Step 3: Verify type check passes**

```bash
cd frontend && npm run check:types
```

Expected: no errors.

**Step 4: Commit**

```bash
git add frontend/src/pages/config/config-section-gateway.tsx \
        frontend/src/pages/config/ConfigPage.tsx
git commit -m "feat: pass credentials props into ConfigSectionGateway"
```

---

### Task 3: Render Telegram detail panel in Gateway section

**Files:**
- Modify: `frontend/src/pages/config/config-section-gateway.tsx`

**Step 1: Rewrite config-section-gateway.tsx**

Replace the entire file content with the following:

```tsx
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import type { AppConfigView, CredentialsView, GatewayConfig } from '@/lib/types';

interface Props {
  config: AppConfigView;
  onChange: (patch: Partial<AppConfigView>) => void;
  credentials: CredentialsView;
  onCredentialsChange: (patch: Partial<CredentialsView>) => void;
}

const CHANNELS: { key: keyof GatewayConfig; label: string; description: string }[] = [
  { key: 'telegram', label: 'Telegram', description: 'Enable the Telegram bot gateway.' },
  { key: 'discord', label: 'Discord', description: 'Enable the Discord bot gateway.' },
  { key: 'slack', label: 'Slack', description: 'Enable the Slack bot gateway (requires both bot + app token).' },
  { key: 'webchat', label: 'WebChat', description: 'Enable the built-in WebSocket chat UI.' },
];

export function ConfigSectionGateway({ config, onChange, credentials, onCredentialsChange }: Props) {
  const [chatIdInput, setChatIdInput] = useState('');

  function setChannel(key: keyof GatewayConfig, enabled: boolean) {
    onChange({
      gateway: {
        ...config.gateway,
        [key]: { enabled },
      },
    });
  }

  function addChatId() {
    const id = parseInt(chatIdInput.trim(), 10);
    if (isNaN(id)) return;
    if (config.allowed_chat_ids.includes(id)) {
      setChatIdInput('');
      return;
    }
    onChange({ allowed_chat_ids: [...config.allowed_chat_ids, id] });
    setChatIdInput('');
  }

  function removeChatId(id: number) {
    onChange({ allowed_chat_ids: config.allowed_chat_ids.filter((x) => x !== id) });
  }

  const chatIdValid = chatIdInput.trim() !== '' && !isNaN(parseInt(chatIdInput.trim(), 10));

  return (
    <div className="space-y-4">
      {CHANNELS.map(({ key, label, description }) => (
        <div key={key} className="rounded-md border border-border/50">
          {/* Toggle row */}
          <div className="flex items-center justify-between p-4">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">{label}</Label>
              <p className="text-xs text-muted-foreground">{description}</p>
            </div>
            <Switch
              checked={config.gateway[key].enabled}
              onCheckedChange={(checked) => setChannel(key, checked)}
            />
          </div>

          {/* Telegram detail panel — only when enabled */}
          {key === 'telegram' && config.gateway.telegram.enabled && (
            <div className="border-t border-border/50 px-4 pb-4 pt-3 space-y-4">
              {/* Bot token */}
              <div className="space-y-1">
                <Label htmlFor="telegram-token" className="text-xs">Bot Token</Label>
                <Input
                  id="telegram-token"
                  type="password"
                  autoComplete="off"
                  placeholder={credentials.telegram_bot_token ? '***' : 'Enter bot token'}
                  value={credentials.telegram_bot_token ?? ''}
                  onChange={(e) => onCredentialsChange({ telegram_bot_token: e.target.value })}
                />
              </div>

              {/* Allowed chat IDs */}
              <div className="space-y-2">
                <Label className="text-xs">Allowed Chat IDs</Label>
                <p className="text-xs text-muted-foreground">
                  Leave empty to allow all chats. Add numeric Telegram chat IDs to restrict access.
                </p>

                {/* Chip list */}
                {config.allowed_chat_ids.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {config.allowed_chat_ids.map((id) => (
                      <span
                        key={id}
                        className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/50 px-2.5 py-0.5 text-xs font-mono"
                      >
                        {id}
                        <button
                          type="button"
                          onClick={() => removeChatId(id)}
                          className="text-muted-foreground hover:text-foreground leading-none"
                          aria-label={`Remove chat ID ${id}`}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                {/* Add input */}
                <div className="flex gap-2">
                  <Input
                    id="telegram-chat-id"
                    className="w-48 font-mono text-sm"
                    placeholder="e.g. 123456789"
                    value={chatIdInput}
                    onChange={(e) => setChatIdInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && chatIdValid && addChatId()}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!chatIdValid}
                    onClick={addChatId}
                  >
                    Add
                  </Button>
                </div>
                {chatIdInput.trim() !== '' && !chatIdValid && (
                  <p className="text-xs text-destructive">Must be a valid integer.</p>
                )}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
```

**Step 2: Verify type check and build pass**

```bash
cd frontend && npm run check:types && npm run build
```

Expected: no errors, build succeeds.

**Step 3: Commit**

```bash
git add frontend/src/pages/config/config-section-gateway.tsx
git commit -m "feat: add Telegram detail panel in Gateway section"
```

---

## Verification

After all tasks are committed:

1. Start the server: `cargo run -p rushdino-server`
2. Open `http://localhost:28847/config` → Gateway section
3. Confirm Telegram toggle shows detail panel when enabled:
   - Bot token field with `***` placeholder (if already set in credentials.toml)
   - Chat IDs list shows existing `allowed_chat_ids` from config.toml
4. Add a chat ID (e.g. `12345`), click Add → chip appears
5. Click Save → verify `~/.rushdino/config.toml` contains `allowed_chat_ids = [12345]`
6. Edit bot token → verify `~/.rushdino/credentials.toml` is updated
7. Disable Telegram toggle → detail panel collapses
8. Run tests: `cargo test -p rushdino-server -p rushdino-common`
