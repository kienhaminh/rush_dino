import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  fetchConfig,
  fetchCredentials,
  patchConfig,
  fetchProviderModels,
  createProfile,
  updateProfile,
  deleteProfile,
  connectCodex,
  type ModelInfo,
} from '@/lib/api';
import { formatProviderLabel } from '@/lib/provider-display';
import type {
  AppConfigView,
  CredentialsView,
  ProviderKind,
  ProviderProfile,
  AuthMethod,
} from '@/lib/types';
import {
  Brain,
  ChevronDown,
  Eye,
  EyeOff,
  Loader2,
  RefreshCw,
  Save,
  Server,
  Sparkles,
  ExternalLink,
  Plus,
  Trash2,
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';

const REDACTED = '***';

const PROVIDER_ICONS: Record<string, React.ReactNode> = {
  openai: <Sparkles className="w-5 h-5 text-emerald-400" />,
  anthropic: <Brain className="w-5 h-5 text-amber-400" />,
  ollama: <Server className="w-5 h-5 text-blue-400" />,
  openai_codex: <Sparkles className="w-5 h-5 text-emerald-400" />,
  plugin: <Server className="w-5 h-5 text-gray-400" />,
};

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
        className="pr-9 font-mono text-sm bg-background border-border/40 focus:border-primary/40 h-9 transition-colors"
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

function ProfileCard({
  profile,
  isExpanded,
  isDefault,
  onToggleExpand,
  onSetDefault,
  onDelete,
  onRefresh,
  hasSecrets,
  isConnected,
}: {
  profile: ProviderProfile;
  isExpanded: boolean;
  isDefault: boolean;
  onToggleExpand: () => void;
  onSetDefault: () => void;
  onDelete: () => void;
  onRefresh: () => void;
  hasSecrets: boolean;
  isConnected: boolean;
}) {
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [apiKey, setApiKey] = useState(hasSecrets ? REDACTED : '');
  const [baseUrl, setBaseUrl] = useState(profile.base_url || '');
  const [model, setModel] = useState(profile.default_model || '');
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const fetchModels = useCallback(async () => {
    setLoadingModels(true);
    try {
      const models = await fetchProviderModels(profile.id);
      setAvailableModels(models);
    } catch (err) {
      console.warn(`Failed to fetch models for ${profile.id}:`, err);
    } finally {
      setLoadingModels(false);
    }
  }, [profile.id]);

  useEffect(() => {
    if (isExpanded) {
      void fetchModels();
    }
  }, [isExpanded, fetchModels]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: any = {
        name: profile.name,
        auth_method: profile.auth_method,
        default_model: model,
        base_url: ['ollama', 'openai', 'openai_codex'].includes(profile.provider_kind)
          ? baseUrl
          : undefined,
      };
      if (apiKey && apiKey !== REDACTED) {
        payload.api_key = apiKey;
      } else if (!apiKey && hasSecrets) {
        payload.api_key = ''; // Clear
      }
      await updateProfile(profile.id, payload);
      toast.success(`${profile.name} updated.`);
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save profile.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this profile?')) return;
    setDeleting(true);
    try {
      await deleteProfile(profile.id);
      toast.success('Profile deleted.');
      onDelete();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete profile.');
    } finally {
      setDeleting(false);
    }
  };

  const handleConnect = async () => {
    setConnecting(true);
    const id = toast.loading('Opening OpenAI OAuth...', {
      description: 'Please complete the login in your browser.',
    });
    try {
      await connectCodex(profile.id);
      toast.success('OAuth connection successful!', { id });
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to connect OAuth.', { id });
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div
      className={`rounded-xl border transition-all duration-200 overflow-hidden ${
        isDefault
          ? 'border-primary/30 bg-card active-profile-glow'
          : 'border-border/40 bg-card/50 hover:border-border/60 hover:bg-card/80'
      }`}
    >
      <div className="flex items-center gap-3 pr-4">
        <button
          type="button"
          onClick={onToggleExpand}
          className="flex-1 flex items-center gap-4 px-5 py-4 text-left min-w-0"
        >
          <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-background/50 border border-border/40 shrink-0">
            {PROVIDER_ICONS[profile.provider_kind] || <Server className="w-5 h-5 text-gray-400" />}
          </div>
          <div className="flex-1 min-w-0">
            <span className="font-semibold text-sm text-foreground block truncate">
              {profile.name}
            </span>
            <p className="text-xs text-muted-foreground mt-0.5 capitalize truncate">
              {formatProviderLabel(profile.provider_kind)} - {profile.auth_method}
            </p>
          </div>
          <div className="flex items-center gap-2.5 shrink-0">
            {isConnected && (
              <Badge
                variant="outline"
                className="text-[10px] bg-emerald-500/10 text-emerald-500 border-emerald-500/20 gap-1 px-1.5 py-0"
              >
                <div className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
                Connected
              </Badge>
            )}
            {isDefault && (
              <Badge variant="secondary" className="text-[10px] hidden sm:inline-flex">
                Default
              </Badge>
            )}
            <ChevronDown
              className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
            />
          </div>
        </button>
        {!isDefault && (
          <Button
            variant="outline"
            size="sm"
            onClick={onSetDefault}
            className="text-[10px] h-7 px-2"
          >
            Set Default
          </Button>
        )}
      </div>

      {isExpanded && (
        <div className="px-5 pb-5 pt-1 border-t border-border/50 space-y-4">
          {['ollama', 'openai', 'openai_codex'].includes(profile.provider_kind) && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Base URL
              </label>
              <Input
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder={
                  profile.provider_kind === 'ollama'
                    ? 'http://localhost:11434'
                    : profile.provider_kind === 'openai_codex'
                      ? 'https://chatgpt.com/backend-api/v1'
                      : 'https://api.openai.com/v1'
                }
                className="font-mono text-sm border-border/40 focus:border-primary/40 h-9"
              />
            </div>
          )}

          {profile.auth_method === 'apikey' && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                API Key
              </label>
              <SecretInput
                id={`${profile.id}-api-key`}
                value={apiKey}
                onChange={setApiKey}
                placeholder="sk-..."
              />
            </div>
          )}

          {profile.auth_method === 'oauth' && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center justify-between">
                OAuth Connection
                {isConnected && (
                  <span className="text-[10px] text-emerald-500 flex items-center gap-1 normal-case font-normal">
                    <div className="w-1 h-1 rounded-full bg-emerald-500" />
                    Connected
                  </span>
                )}
              </label>
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-2 border-primary/20 hover:bg-primary/5 text-primary"
                onClick={handleConnect}
                disabled={connecting}
              >
                {connecting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <ExternalLink className="w-4 h-4" />
                )}
                {isConnected ? 'Reconnect OAuth' : 'Connect OAuth'}
              </Button>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center justify-between">
              Default Model{' '}
              {loadingModels && <Loader2 className="w-3 h-3 animate-spin text-primary" />}
            </label>
            <div className="flex gap-2">
              {availableModels.length > 0 ? (
                <Select value={model} onValueChange={setModel}>
                  <SelectTrigger className="h-9 flex-1 border-border/40 focus:border-primary/40">
                    <SelectValue placeholder="Select model...">
                      {availableModels.find((m) => m.id === model)?.name ||
                        model ||
                        'Select model...'}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="max-h-[250px] border-border/40 bg-popover/95 backdrop-blur-xl shadow-2xl">
                    <ScrollArea className="h-full">
                      {availableModels.map((m) => (
                        <SelectItem key={m.id} value={m.id} textValue={m.name || m.id}>
                          <div className="flex flex-col text-left py-0.5 max-w-[300px]">
                            <span className="font-medium text-sm truncate">{m.name || m.id}</span>
                            {m.description && (
                              <span className="text-xs text-muted-foreground truncate">
                                {m.description}
                              </span>
                            )}
                            {m.name && m.id !== m.name && (
                              <span className="text-[10px] text-muted-foreground/70 font-mono truncate">
                                {m.id}
                              </span>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </ScrollArea>
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="h-9 flex-1 font-mono text-sm"
                />
              )}
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9 shrink-0"
                onClick={fetchModels}
                disabled={loadingModels}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingModels ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-border/50">
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDelete}
              disabled={deleting}
              className="h-8 text-xs gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving}
              className="h-8 text-xs gap-1.5"
            >
              {saving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}{' '}
              Save
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function AddProfileDialog({ onRefresh }: { onRefresh: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [providerKind, setProviderKind] = useState<ProviderKind | ''>('');
  const [authMethod, setAuthMethod] = useState<AuthMethod>('apikey');
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);

  const handleAdd = async () => {
    if (!name || !providerKind) return;
    setSaving(true);
    try {
      const payload: any = {
        name,
        provider_kind: providerKind,
        auth_method: authMethod,
        default_model: providerKind === 'ollama' ? 'llama3' : 'gpt-4o-mini',
      };
      if (authMethod === 'apikey' && apiKey) {
        payload.api_key = apiKey;
      }
      await createProfile(payload);
      toast.success('Profile created successfully.');
      setOpen(false);
      setName('');
      setProviderKind('');
      setApiKey('');
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create profile.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <Plus className="w-3.5 h-3.5" /> Add Profile
        </Button>
      </DialogTrigger>
      <DialogContent className="border-border/50 bg-popover/95 backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle>Add Model Profile</DialogTitle>
          <DialogDescription>
            Create a model profile with its provider, authentication method, and default model.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Profile Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. My Personal OpenAI"
              className="border-border/40 focus:border-primary/40 h-9 transition-colors"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Provider</label>
            <Select
              value={providerKind}
              onValueChange={(v) => {
                setProviderKind(v as ProviderKind);
                if (v === 'ollama') setAuthMethod('none');
                else if (v === 'openai_codex') setAuthMethod('oauth');
                else setAuthMethod('apikey');
              }}
            >
              <SelectTrigger className="border-border/40 focus:border-primary/40">
                <SelectValue placeholder="Select Engine..." />
              </SelectTrigger>
              <SelectContent className="border-border/40 bg-popover/95 backdrop-blur-xl shadow-2xl">
                <SelectItem value="openai">OpenAI</SelectItem>
                <SelectItem value="openai_codex">Codex (ChatGPT)</SelectItem>
                <SelectItem value="anthropic">Anthropic</SelectItem>
                <SelectItem value="ollama">Ollama (Local)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {providerKind && providerKind !== 'ollama' && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Authentication Method</label>
              <Select value={authMethod} onValueChange={(v) => setAuthMethod(v as AuthMethod)}>
                <SelectTrigger className="border-border/40 focus:border-primary/40">
                  <SelectValue placeholder="Method..." />
                </SelectTrigger>
                <SelectContent className="border-border/40 bg-popover/95 backdrop-blur-xl shadow-2xl">
                  {providerKind !== 'openai_codex' && (
                    <SelectItem value="apikey">API Key</SelectItem>
                  )}
                  {['openai', 'openai_codex'].includes(providerKind) && (
                    <SelectItem value="oauth">OAuth</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          )}
          {authMethod === 'apikey' && providerKind !== 'ollama' && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium">API Key (optional now)</label>
              <SecretInput
                id="new-profile-api"
                value={apiKey}
                onChange={setApiKey}
                placeholder="sk-..."
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleAdd} disabled={!name || !providerKind || saving}>
            {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />} Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ConfigSectionProfiles() {
  const [config, setConfig] = useState<AppConfigView | null>(null);
  const [credentials, setCredentials] = useState<CredentialsView | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expandedProfile, setExpandedProfile] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [cfg, creds] = await Promise.all([fetchConfig(), fetchCredentials()]);
      setConfig(cfg);
      setCredentials(creds);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load config.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSetDefault = async (profileId: string) => {
    try {
      const patch = { default_profile_id: profileId, fallback_profile_ids: [] };
      const nextConfig = await patchConfig(patch);
      setConfig(nextConfig);
      toast.success('Default profile updated.');
    } catch (err) {
      toast.error('Failed to set default profile.');
    }
  };

  const profiles = config?.profiles || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div />
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={load}
            disabled={loading}
            className="gap-1.5 shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
          <AddProfileDialog onRefresh={load} />
        </div>
      </div>

      {loadError && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
          {loadError}
        </div>
      )}

      {profiles.length === 0 && !loading && !loadError && (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground text-sm">
          No model profiles found. Create one to get started.
        </div>
      )}

      <div className="space-y-3">
        {profiles.map((p) => {
          const secret = credentials?.profiles?.[p.id];
          const hasSecrets = !!secret && (!!secret.api_key || !!secret.access_token);
          const isConnected =
            !!secret &&
            ((p.auth_method === 'apikey' && !!secret.api_key) ||
              (p.auth_method === 'oauth' && !!secret.access_token));
          return (
            <ProfileCard
              key={p.id}
              profile={p}
              isExpanded={expandedProfile === p.id}
              isDefault={config?.default_profile_id === p.id}
              onToggleExpand={() => setExpandedProfile((prev) => (prev === p.id ? null : p.id))}
              onSetDefault={() => handleSetDefault(p.id)}
              onDelete={load}
              onRefresh={load}
              hasSecrets={hasSecrets}
              isConnected={isConnected}
            />
          );
        })}
      </div>
    </div>
  );
}
