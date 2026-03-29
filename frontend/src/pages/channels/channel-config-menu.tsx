import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import type { AppConfigView, ChannelAccessConfig, CredentialsView, DmPolicy } from '@/lib/types';
import type {
  ChannelConfigAction,
  ChannelDetailConfigPatch,
  ChannelKey,
  ChannelUiSettings,
} from './ChannelsPage';
import {
  defaultDmPolicyForChannel,
  getOpenClawChannelFields,
  type ChannelSettingField,
} from './channel-openclaw-settings';

type ChannelConfigMenuProps = {
  channel: ChannelKey;
  config: AppConfigView | null;
  credentials: CredentialsView | null;
  currentEnabled: boolean;
  settings?: ChannelUiSettings;
  saving: boolean;
  onAction: (
    channel: ChannelKey,
    patch: ChannelDetailConfigPatch,
    action: ChannelConfigAction,
  ) => void;
};

const CREDENTIAL_FIELD_KEYS = [
  'telegramBotToken',
  'discordBotToken',
  'slackBotToken',
  'slackAppToken',
];

function getPathValue(record: Record<string, unknown>, path: string): unknown {
  const keys = path.split('.');
  let current: unknown = record;
  for (const key of keys) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function setPathValue(
  record: Record<string, unknown>,
  path: string,
  value: unknown,
): Record<string, unknown> {
  const keys = path.split('.');
  const next: Record<string, unknown> = { ...record };
  let cursor: Record<string, unknown> = next;

  for (let index = 0; index < keys.length - 1; index += 1) {
    const key = keys[index];
    const existing = cursor[key];
    const child =
      existing && typeof existing === 'object' && !Array.isArray(existing)
        ? { ...(existing as Record<string, unknown>) }
        : {};
    cursor[key] = child;
    cursor = child;
  }

  cursor[keys[keys.length - 1]] = value;
  return next;
}

function setPathValueMutable(record: Record<string, unknown>, path: string, value: unknown) {
  const keys = path.split('.');
  let cursor: Record<string, unknown> = record;

  for (let index = 0; index < keys.length - 1; index += 1) {
    const key = keys[index];
    const existing = cursor[key];
    if (!existing || typeof existing !== 'object' || Array.isArray(existing)) {
      cursor[key] = {};
    }
    cursor = cursor[key] as Record<string, unknown>;
  }

  cursor[keys[keys.length - 1]] = value;
}

function normalizeLegacySettings(settings?: ChannelUiSettings): Record<string, unknown> {
  const values =
    settings?.values && typeof settings.values === 'object' && !Array.isArray(settings.values)
      ? { ...settings.values }
      : {};

  if (settings?.allowList && values.allowFrom == null) {
    values.allowFrom = settings.allowList;
  }

  if (settings?.permissions) {
    const permissionMap: Record<string, unknown> = {
      'permissions.readMessages': settings.permissions.readMessages,
      'permissions.writeMessages': settings.permissions.writeMessages,
      'permissions.updateMessages': settings.permissions.updateMessages,
      'permissions.deleteMessages': settings.permissions.deleteMessages,
    };

    Object.entries(permissionMap).forEach(([path, value]) => {
      if (typeof value === 'boolean' && getPathValue(values, path) == null) {
        setPathValueMutable(values, path, value);
      }
    });
  }

  return values;
}

function toFieldInputValue(field: ChannelSettingField, value: unknown): string {
  if (value == null) return '';

  if (field.type === 'list') {
    if (Array.isArray(value)) {
      return value.map((entry) => String(entry)).join('\n');
    }
    return String(value);
  }

  if (field.type === 'textarea') {
    if (typeof value === 'string') return value;
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }

  if (field.type === 'number') {
    return typeof value === 'number' ? String(value) : String(value);
  }

  return String(value);
}

function normalizeValueForStorage(field: ChannelSettingField, raw: unknown): unknown {
  if (field.type === 'boolean') {
    return Boolean(raw);
  }

  if (field.type === 'number') {
    if (raw == null || raw === '') return undefined;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  if (field.type === 'list') {
    if (typeof raw !== 'string') {
      if (Array.isArray(raw)) return raw;
      return undefined;
    }
    const parsed = raw
      .split(/[\n,]/)
      .map((entry) => entry.trim())
      .filter(Boolean);
    return parsed.length > 0 ? parsed : undefined;
  }

  if (field.type === 'textarea') {
    if (typeof raw !== 'string') return raw;
    const trimmed = raw.trim();
    if (!trimmed) return undefined;
    if (
      (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))
    ) {
      try {
        return JSON.parse(trimmed);
      } catch {
        return raw;
      }
    }
    return raw;
  }

  if (typeof raw !== 'string') return raw;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? raw : undefined;
}

function tokenValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function toDmPolicy(value: unknown): DmPolicy {
  return value === 'pairing' || value === 'allowlist' || value === 'disabled' ? value : 'open';
}

function groupedFields(fields: ChannelSettingField[]): Array<[string, ChannelSettingField[]]> {
  const bySection = new Map<string, ChannelSettingField[]>();

  fields.forEach((field) => {
    if (!bySection.has(field.section)) bySection.set(field.section, []);
    bySection.get(field.section)?.push(field);
  });

  return Array.from(bySection.entries());
}

function sectionDescription(section: string): string {
  if (section === 'Connection') {
    return 'Store the credentials and transport settings this gateway needs.';
  }
  if (section === 'Access Control') {
    return 'Define who can reach the agent through this channel.';
  }
  return 'Tune the core reply and history behavior for this channel.';
}

export function ChannelConfigMenu({
  channel,
  config,
  credentials,
  currentEnabled,
  settings,
  saving,
  onAction,
}: ChannelConfigMenuProps) {
  const initialValues = useMemo(() => {
    let nextValues = normalizeLegacySettings(settings);

    nextValues = setPathValue(nextValues, 'enabled', currentEnabled);

    if (channel === 'telegram') {
      nextValues = setPathValue(
        nextValues,
        'enabled',
        Boolean(config?.gateway.telegram.enabled ?? currentEnabled),
      );
      nextValues = setPathValue(
        nextValues,
        'telegramBotToken',
        credentials?.telegram_bot_token ?? '',
      );
      nextValues = setPathValue(
        nextValues,
        'dmPolicy',
        config?.gateway.telegram.access?.dm_policy ?? defaultDmPolicyForChannel(channel),
      );
      nextValues = setPathValue(
        nextValues,
        'allowFrom',
        config?.gateway.telegram.access?.allow_from ?? [],
      );
      nextValues = setPathValue(
        nextValues,
        'nativeStreaming',
        Boolean(config?.gateway.telegram.native_streaming ?? false),
      );

      if (getPathValue(nextValues, 'permissions.readMessages') == null) {
        nextValues = setPathValue(nextValues, 'permissions.readMessages', true);
      }
      if (getPathValue(nextValues, 'permissions.writeMessages') == null) {
        nextValues = setPathValue(nextValues, 'permissions.writeMessages', true);
      }
      if (getPathValue(nextValues, 'permissions.updateMessages') == null) {
        nextValues = setPathValue(nextValues, 'permissions.updateMessages', false);
      }
      if (getPathValue(nextValues, 'permissions.deleteMessages') == null) {
        nextValues = setPathValue(nextValues, 'permissions.deleteMessages', false);
      }
    }

    if (channel === 'discord') {
      nextValues = setPathValue(
        nextValues,
        'enabled',
        Boolean(config?.gateway.discord.enabled ?? currentEnabled),
      );
      nextValues = setPathValue(
        nextValues,
        'discordBotToken',
        credentials?.discord_bot_token ?? '',
      );
      nextValues = setPathValue(
        nextValues,
        'dmPolicy',
        config?.gateway.discord.access?.dm_policy ?? defaultDmPolicyForChannel(channel),
      );
      nextValues = setPathValue(
        nextValues,
        'allowFrom',
        config?.gateway.discord.access?.allow_from ?? [],
      );
    }

    if (channel === 'slack') {
      nextValues = setPathValue(
        nextValues,
        'enabled',
        Boolean(config?.gateway.slack.enabled ?? currentEnabled),
      );
      nextValues = setPathValue(nextValues, 'slackBotToken', credentials?.slack_bot_token ?? '');
      nextValues = setPathValue(nextValues, 'slackAppToken', credentials?.slack_app_token ?? '');
    }

    if (channel === 'mobile') {
      nextValues = setPathValue(
        nextValues,
        'enabled',
        Boolean(config?.gateway.mobile.enabled ?? currentEnabled),
      );
      nextValues = setPathValue(
        nextValues,
        'publishHost',
        config?.gateway.mobile.publish_host ?? '',
      );
    }

    return nextValues;
  }, [channel, config, credentials, settings, currentEnabled]);

  const [formValues, setFormValues] = useState<Record<string, unknown>>(initialValues);
  const prevSavingRef = useRef(saving);

  const fields = useMemo(() => getOpenClawChannelFields(channel), [channel]);
  const sections = useMemo(() => groupedFields(fields), [fields]);

  useEffect(() => {
    if (prevSavingRef.current && !saving) {
      setFormValues(initialValues);
    }
    prevSavingRef.current = saving;
  }, [initialValues, saving]);

  const setFieldValue = (path: string, value: unknown) => {
    setFormValues((prev) => setPathValue(prev, path, value));
  };

  const buildPatch = (): ChannelDetailConfigPatch => {
    const uiValues: Record<string, unknown> = {};

    fields.forEach((field) => {
      if (CREDENTIAL_FIELD_KEYS.includes(field.key)) return;
      const normalized = normalizeValueForStorage(field, getPathValue(formValues, field.key));
      if (normalized !== undefined) {
        setPathValueMutable(uiValues, field.key, normalized);
      }
    });

    const enabledRaw = getPathValue(formValues, 'enabled');
    const patch: ChannelDetailConfigPatch = {
      enabled: typeof enabledRaw === 'boolean' ? enabledRaw : Boolean(enabledRaw),
      uiSettings: {
        values: uiValues,
      },
    };

    if (channel === 'telegram') {
      patch.telegramBotToken = tokenValue(getPathValue(formValues, 'telegramBotToken'));
      patch.telegramNativeStreaming = Boolean(getPathValue(formValues, 'nativeStreaming'));
    }

    if (channel === 'discord') {
      patch.discordBotToken = tokenValue(getPathValue(formValues, 'discordBotToken'));
    }

    if (channel === 'telegram' || channel === 'discord') {
      patch.gatewayAccess = {
        dm_policy: toDmPolicy(getPathValue(formValues, 'dmPolicy')),
        allow_from: Array.isArray(getPathValue(formValues, 'allowFrom'))
          ? (getPathValue(formValues, 'allowFrom') as string[])
          : typeof getPathValue(formValues, 'allowFrom') === 'string'
            ? (normalizeValueForStorage(
                { key: 'allowFrom', label: '', section: '', type: 'list' },
                getPathValue(formValues, 'allowFrom'),
              ) as string[] | undefined) ?? []
            : [],
      } satisfies ChannelAccessConfig;
    }

    if (channel === 'slack') {
      patch.slackBotToken = tokenValue(getPathValue(formValues, 'slackBotToken'));
      patch.slackAppToken = tokenValue(getPathValue(formValues, 'slackAppToken'));
    }

    if (channel === 'mobile') {
      const publishHost = getPathValue(formValues, 'publishHost');
      if (typeof publishHost === 'string') {
        patch.mobilePublishHost = publishHost;
      }
    }

    return patch;
  };

  const renderField = (field: ChannelSettingField) => {
    const value = getPathValue(formValues, field.key);

    if (field.type === 'boolean') {
      return (
        <div className="flex h-full items-center justify-between rounded-md border border-border/50 bg-muted/20 px-3 py-2.5">
          <div>
            <Label className="text-xs font-medium">{field.label}</Label>
            {field.description && (
              <p className="mt-1 text-[11px] text-muted-foreground">{field.description}</p>
            )}
          </div>
          <Switch
            checked={Boolean(value)}
            onCheckedChange={(checked) => setFieldValue(field.key, checked)}
            disabled={saving}
          />
        </div>
      );
    }

    if (field.type === 'select') {
      const unsetValue = '__unset__';
      const selectValue = typeof value === 'string' ? value : '';
      return (
        <div className="space-y-1">
          <Label className="text-xs font-medium">{field.label}</Label>
          <Select
            value={selectValue || unsetValue}
            onValueChange={(next) => setFieldValue(field.key, next === unsetValue ? '' : next)}
            disabled={saving}
          >
            <SelectTrigger className="h-9 text-xs">
              <SelectValue placeholder="Select an option" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={unsetValue}>Unset</SelectItem>
              {(field.options ?? []).map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {field.description && <p className="text-[11px] text-muted-foreground">{field.description}</p>}
        </div>
      );
    }

    const inputValue = toFieldInputValue(field, value);

    if (field.type === 'textarea' || field.type === 'list') {
      return (
        <div className="space-y-1">
          <Label className="text-xs font-medium">{field.label}</Label>
          <Textarea
            className="min-h-[90px] text-xs"
            value={inputValue}
            placeholder={field.placeholder}
            onChange={(event) => setFieldValue(field.key, event.target.value)}
            disabled={saving}
          />
          {field.description && <p className="text-[11px] text-muted-foreground">{field.description}</p>}
        </div>
      );
    }

    return (
      <div className="space-y-1">
        <Label className="text-xs font-medium">{field.label}</Label>
        <Input
          type={field.type === 'number' ? 'number' : field.type === 'secret' ? 'password' : 'text'}
          autoComplete="off"
          value={inputValue}
          placeholder={field.placeholder}
          onChange={(event) => setFieldValue(field.key, event.target.value)}
          disabled={saving}
          className="text-xs"
        />
        {field.description && <p className="text-[11px] text-muted-foreground">{field.description}</p>}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {sections.map(([section, sectionFields], index) => (
        <section
          key={section}
          className={index === 0 ? 'space-y-3' : 'space-y-3 border-t border-border/50 pt-6'}
        >
          <div className="space-y-1">
            <h3 className="text-sm font-semibold">{section}</h3>
            <p className="text-xs text-muted-foreground">{sectionDescription(section)}</p>
          </div>
          <div className="grid grid-cols-1 gap-y-4 lg:grid-cols-2 lg:gap-x-8">
            {sectionFields.map((field) => {
              const spanTwoColumns = field.type === 'textarea' || field.type === 'list';
              return (
                <div key={field.key} className={spanTwoColumns ? 'lg:col-span-2' : undefined}>
                  {renderField(field)}
                </div>
              );
            })}
          </div>
        </section>
      ))}

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border/50 pt-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onAction(channel, buildPatch(), 'test')}
          disabled={saving}
        >
          Test Connection
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onAction(channel, buildPatch(), 'connect')}
          disabled={saving}
        >
          Connect
        </Button>
        <Button
          size="sm"
          onClick={() => onAction(channel, buildPatch(), 'save')}
          disabled={saving}
          className="min-w-[80px]"
        >
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </div>
    </div>
  );
}
