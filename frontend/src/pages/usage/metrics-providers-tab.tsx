import React, { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { fetchConfig, fetchCredentials, patchConfig, patchCredentials } from '@/lib/api';
import type { AppConfigView, CredentialsView, ProviderKind } from '@/lib/types';
import {
  Brain,
  CheckCircle2,
  ChevronDown,
  Eye,
  EyeOff,
  Loader2,
  RefreshCw,
  Save,
  Server,
  Sparkles,
  ToggleLeft,
  ToggleRight,
  Zap,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type ProviderStatus = 'connected' | 'partial' | 'unconfigured';

interface ProviderInfo {
  id: ProviderKind;
  label: string;
  description: string;
  icon: React.ReactNode;
  accentColor: string;
  bgColor: string;
  supportsOauth: boolean;
}

// ─── Provider Definitions ────────────────────────────────────────────────────

const PROVIDERS: ProviderInfo[] = [
  {
    id: 'openai',
    label: 'OpenAI',
    description: 'GPT-4o, GPT-4 Turbo, o1-series and more.',
    icon: <Sparkles className="w-5 h-5" />,
    accentColor: 'text-emerald-400',
    bgColor: 'bg-emerald-400/10',
    supportsOauth: false,
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    description: 'Claude 3.5 Sonnet, Claude 3 Opus, Haiku and more.',
    icon: <Brain className="w-5 h-5" />,
    accentColor: 'text-amber-400',
    bgColor: 'bg-amber-400/10',
    supportsOauth: false,
  },
  {
    id: 'ollama',
    label: 'Ollama',
    description: 'Self-hosted local models. No API key required.',
    icon: <Server className="w-5 h-5" />,
    accentColor: 'text-blue-400',
    bgColor: 'bg-blue-400/10',
    supportsOauth: false,
  },
  {
    id: 'codex',
    label: 'Codex / Azure',
    description: 'Azure OpenAI or OpenAI Codex API endpoints.',
    icon: <Zap className="w-5 h-5" />,
    accentColor: 'text-violet-400',
    bgColor: 'bg-violet-400/10',
    supportsOauth: false,
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const REDACTED = '***';

/**
 * Read active providers from config. Supports both the legacy `active_provider`
 * scalar field and the new `active_providers` array field.
 */
function readActiveProviders(config: AppConfigView | null): ProviderKind[] {
  if (!config) return [];
  // New array field takes precedence
  const arr = config.active_providers;
  if (Array.isArray(arr) && arr.length > 0) {
    return arr as ProviderKind[];
  }
  // Fall back to legacy scalar
  if (config.active_provider) {
    return [config.active_provider as ProviderKind];
  }
  return [];
}

function maskSecret(value: string | undefined): string {
  if (!value || value.trim() === '') return '';
  return REDACTED;
}

function getProviderStatus(
  provider: ProviderKind,
  config: AppConfigView | null,
  credentials: CredentialsView | null,
): ProviderStatus {
  if (!config || !credentials) return 'unconfigured';
  const key = apiKeyFieldFor(provider);
  const hasKey = key ? Boolean(credentials[key]) : false;
  if (provider === 'ollama') {
    return config.ollama?.base_url ? 'connected' : 'unconfigured';
  }
  return hasKey ? 'connected' : 'unconfigured';
}

function apiKeyFieldFor(provider: ProviderKind): keyof CredentialsView | null {
  switch (provider) {
    case 'openai':
      return 'openai_api_key';
    case 'anthropic':
      return 'anthropic_api_key';
    default:
      return null;
  }
}

// ─── StatusDot ───────────────────────────────────────────────────────────────

function StatusDot({ status }: { status: ProviderStatus }) {
  if (status === 'connected') {
    return <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]" />;
  }
  if (status === 'partial') {
    return <span className="w-2 h-2 rounded-full bg-amber-400" />;
  }
  return <span className="w-2 h-2 rounded-full bg-muted-foreground/30" />;
}

// ─── ActiveToggle ─────────────────────────────────────────────────────────────

/**
 * A pill-style toggle button that activates / deactivates a provider from the
 * global active set. Styled to feel intentional — glows when active.
 */
function ActiveToggle({
  isActive,
  disabled,
  onChange,
}: {
  isActive: boolean;
  disabled: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(e) => {
        // Prevent accordion toggle from firing
        e.stopPropagation();
        onChange(!isActive);
      }}
      title={isActive ? 'Deactivate provider' : 'Activate provider'}
      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all duration-200 shrink-0 ${
        isActive
          ? 'bg-primary/15 border-primary/40 text-primary shadow-[0_0_8px_hsl(var(--primary)/0.3)]'
          : 'bg-muted/50 border-border/60 text-muted-foreground hover:border-border hover:text-foreground'
      } disabled:opacity-50 disabled:cursor-not-allowed`}
    >
      {isActive ? <ToggleRight className="w-3.5 h-3.5" /> : <ToggleLeft className="w-3.5 h-3.5" />}
      {isActive ? 'Active' : 'Inactive'}
    </button>
  );
}

// ─── SecretInput ──────────────────────────────────────────────────────────────

function SecretInput({
  id,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="pr-9 font-mono text-sm bg-background border-border h-9"
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setShow((v) => !v)}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
      >
        {show ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}

// ─── ProviderCard ─────────────────────────────────────────────────────────────

interface ProviderCardProps {
  provider: ProviderInfo;
  config: AppConfigView | null;
  credentials: CredentialsView | null;
  /** Whether this card's detail body is expanded */
  isExpanded: boolean;
  /** Whether this provider is in the active set */
  isActiveProvider: boolean;
  onToggleExpand: () => void;
  onToggleActive: (next: boolean) => Promise<void>;
  onSaved: (nextConfig: AppConfigView | null, nextCreds: CredentialsView | null) => void;
}

function ProviderCard({
  provider,
  config,
  credentials,
  isExpanded,
  isActiveProvider,
  onToggleExpand,
  onToggleActive,
  onSaved,
}: ProviderCardProps) {
  const status = getProviderStatus(provider.id, config, credentials);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);

  // Local form state
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const initialisedRef = useRef(false);

  // Populate form on first expand
  useEffect(() => {
    if (!isExpanded || initialisedRef.current) return;
    initialisedRef.current = true;

    const keyField = apiKeyFieldFor(provider.id);
    if (keyField && credentials?.[keyField]) {
      setApiKey(maskSecret(credentials[keyField]));
    }
    if (provider.id === 'ollama' && config?.ollama) {
      setBaseUrl(config.ollama.base_url ?? '');
      setModel(config.ollama.model ?? '');
    }
    if (provider.id === 'openai' && config?.openai) {
      setModel(config.openai.model ?? '');
    }
    if (provider.id === 'anthropic' && config?.anthropic) {
      setModel(config.anthropic.model ?? '');
    }
    if (provider.id === 'codex' && config?.codex) {
      setModel((config.codex as { model?: string }).model ?? '');
    }
  }, [isExpanded, provider.id, config, credentials]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const configPatch: Partial<AppConfigView> = {};
      const credsPatch: Partial<CredentialsView> = {};

      const keyField = apiKeyFieldFor(provider.id);
      if (keyField && apiKey && apiKey !== REDACTED) {
        credsPatch[keyField] = apiKey;
      }
      if (provider.id === 'openai' && model) configPatch.openai = { model };
      if (provider.id === 'anthropic' && model) configPatch.anthropic = { model };
      if (provider.id === 'codex' && model) configPatch.codex = { model };
      if (provider.id === 'ollama') configPatch.ollama = { base_url: baseUrl, model };

      const hasConfigPatch = Object.keys(configPatch).length > 0;
      const hasCredsPatch = Object.keys(credsPatch).length > 0;

      const [nextConfig, nextCreds] = await Promise.all([
        hasConfigPatch ? patchConfig(configPatch) : Promise.resolve(config),
        hasCredsPatch ? patchCredentials(credsPatch) : Promise.resolve(credentials),
      ]);

      onSaved(nextConfig, nextCreds);
      toast.success(`${provider.label} configuration saved.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Failed to save ${provider.label} config.`);
    } finally {
      setSaving(false);
    }
  }, [provider, apiKey, model, baseUrl, config, credentials, onSaved]);

  const handleActiveChange = useCallback(
    async (next: boolean) => {
      setToggling(true);
      try {
        await onToggleActive(next);
      } finally {
        setToggling(false);
      }
    },
    [onToggleActive],
  );

  return (
    <div
      className={`rounded-xl border transition-all duration-200 overflow-hidden ${
        isActiveProvider
          ? 'border-primary/30 bg-card'
          : 'border-border/50 bg-card/50 hover:border-border hover:bg-card/80'
      }`}
    >
      {/* Card header — always visible */}
      <div className="flex items-center gap-3 pr-4">
        <button
          type="button"
          onClick={onToggleExpand}
          className="flex-1 flex items-center gap-4 px-5 py-4 text-left min-w-0"
        >
          {/* Icon */}
          <div
            className={`w-10 h-10 rounded-lg flex items-center justify-center ${provider.bgColor} ${provider.accentColor} shrink-0`}
          >
            {provider.icon}
          </div>

          {/* Labels */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm text-foreground">{provider.label}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{provider.description}</p>
          </div>

          {/* Status + chevron */}
          <div className="flex items-center gap-2.5 shrink-0">
            <StatusDot status={status} />
            <span className="text-xs text-muted-foreground capitalize hidden sm:block">
              {status}
            </span>
            <ChevronDown
              className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
            />
          </div>
        </button>

        {/* Active toggle — outside the accordion button so click doesn't expand */}
        <ActiveToggle
          isActive={isActiveProvider}
          disabled={toggling}
          onChange={handleActiveChange}
        />
      </div>

      {/* Expanded panel */}
      {isExpanded && (
        <div className="px-5 pb-5 pt-1 border-t border-border/50 space-y-4">
          {/* Ollama: base URL */}
          {provider.id === 'ollama' && (
            <div className="space-y-1.5">
              <label
                htmlFor={`${provider.id}-base-url`}
                className="text-xs font-medium text-muted-foreground uppercase tracking-wider"
              >
                Base URL
              </label>
              <Input
                id={`${provider.id}-base-url`}
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="http://localhost:11434"
                className="font-mono text-sm bg-background border-border h-9"
              />
            </div>
          )}

          {/* API key */}
          {apiKeyFieldFor(provider.id) && (
            <div className="space-y-1.5">
              <label
                htmlFor={`${provider.id}-apikey`}
                className="text-xs font-medium text-muted-foreground uppercase tracking-wider"
              >
                API Key
              </label>
              <SecretInput
                id={`${provider.id}-apikey`}
                value={apiKey}
                onChange={setApiKey}
                placeholder={`${provider.label} API key…`}
              />
              <p className="text-[11px] text-muted-foreground">
                Stored encrypted on disk. Leave as{' '}
                <code className="bg-muted px-1 rounded text-xs">***</code> to keep existing key.
              </p>
            </div>
          )}

          {/* Default model */}
          <div className="space-y-1.5">
            <label
              htmlFor={`${provider.id}-model`}
              className="text-xs font-medium text-muted-foreground uppercase tracking-wider"
            >
              Default Model
            </label>
            <Input
              id={`${provider.id}-model`}
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={
                provider.id === 'openai'
                  ? 'gpt-4o'
                  : provider.id === 'anthropic'
                    ? 'claude-3-5-sonnet-20241022'
                    : provider.id === 'ollama'
                      ? 'llama3'
                      : 'model-name'
              }
              className="font-mono text-sm bg-background border-border h-9"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1">
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving || toggling}
              className="gap-1.5"
            >
              {saving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              Save
            </Button>

            {isActiveProvider && (
              <span className="text-xs text-primary flex items-center gap-1.5 ml-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Provider is active
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Active providers summary strip ──────────────────────────────────────────

function ActiveProvidersSummary({ activeIds }: { activeIds: ProviderKind[] }) {
  if (activeIds.length === 0) {
    return (
      <div className="rounded-lg bg-muted/40 border border-border/50 px-4 py-3 flex items-center gap-2.5">
        <span className="w-2 h-2 rounded-full bg-muted-foreground/30" />
        <span className="text-sm text-muted-foreground">No providers are currently active.</span>
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-primary/5 border border-primary/20 px-4 py-3 flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider mr-1">
        Active:
      </span>
      {activeIds.map((id) => {
        const info = PROVIDERS.find((p) => p.id === id);
        return (
          <span
            key={id}
            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/25`}
          >
            {info?.icon && (
              <span className={`${info.accentColor}`} style={{ fontSize: 12, lineHeight: 1 }}>
                {info.icon}
              </span>
            )}
            {info?.label ?? id}
          </span>
        );
      })}
    </div>
  );
}

// ─── MetricsProvidersTab ──────────────────────────────────────────────────────

export function MetricsProvidersTab() {
  const [config, setConfig] = useState<AppConfigView | null>(null);
  const [credentials, setCredentials] = useState<CredentialsView | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expandedProvider, setExpandedProvider] = useState<ProviderKind | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [cfg, creds] = await Promise.all([fetchConfig(), fetchCredentials()]);
      setConfig(cfg);
      setCredentials(creds);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load provider config.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSaved = useCallback(
    (nextConfig: AppConfigView | null, nextCreds: CredentialsView | null) => {
      if (nextConfig) setConfig(nextConfig);
      if (nextCreds) setCredentials(nextCreds);
    },
    [],
  );

  /**
   * Toggle a provider in/out of the active_providers list.
   * Persists the full updated array via PATCH /api/config.
   */
  const handleToggleActive = useCallback(
    async (providerId: ProviderKind, makeActive: boolean) => {
      const current = readActiveProviders(config);
      const next = makeActive
        ? Array.from(new Set([...current, providerId]))
        : current.filter((id) => id !== providerId);

      try {
        // We write both the new array and keep the legacy scalar in sync so the
        // backend can still read active_provider if it only knows the old field.
        const patch: Partial<AppConfigView> = {
          active_providers: next as unknown as AppConfigView['active_providers'],
          // Keep legacy field pointing at the first active provider (or clear it)
          active_provider: (next[0] ?? null) as unknown as AppConfigView['active_provider'],
        };
        const nextConfig = await patchConfig(patch);
        setConfig(nextConfig);
        toast.success(
          makeActive
            ? `${PROVIDERS.find((p) => p.id === providerId)?.label ?? providerId} added to active providers.`
            : `${PROVIDERS.find((p) => p.id === providerId)?.label ?? providerId} removed from active providers.`,
        );
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to update active providers.');
      }
    },
    [config],
  );

  const activeProviderIds = readActiveProviders(config);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-4 lg:p-6 space-y-6 max-w-3xl mx-auto">
        {/* Section header */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-base text-foreground">AI Providers</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Toggle which providers are active. Configure API keys and models below.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={load} disabled={loading} className="gap-1.5">
            {loading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            Refresh
          </Button>
        </div>

        {/* Load error */}
        {loadError && (
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
            {loadError}
          </div>
        )}

        {/* Active providers summary */}
        <ActiveProvidersSummary activeIds={activeProviderIds} />

        {/* Provider cards */}
        <div className="space-y-3">
          {PROVIDERS.map((provider) => (
            <ProviderCard
              key={provider.id}
              provider={provider}
              config={config}
              credentials={credentials}
              isExpanded={expandedProvider === provider.id}
              isActiveProvider={activeProviderIds.includes(provider.id)}
              onToggleExpand={() =>
                setExpandedProvider((prev) => (prev === provider.id ? null : provider.id))
              }
              onToggleActive={(next) => handleToggleActive(provider.id, next)}
              onSaved={handleSaved}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
