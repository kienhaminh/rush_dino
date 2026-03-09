import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Settings2Icon } from 'lucide-react';
import { fetchConfig, fetchCredentials, patchConfig, patchCredentials } from '@/lib/api';
import type { AppConfigView, CredentialsView } from '@/lib/types';
import { ConfigSectionProfiles } from './config-section-profiles';
import { ConfigSectionCredentials } from './config-section-credentials';
import { ConfigSectionServer } from './config-section-server';

type Section = 'profiles' | 'credentials' | 'server';

const SECTIONS: { key: Section; label: string; description: string }[] = [
  {
    key: 'profiles',
    label: 'Model Profiles',
    description: 'Manage AI accounts, models, and the default profile used by RushDino.',
  },
  { key: 'credentials', label: 'Credentials', description: 'API keys and bot tokens.' },
  { key: 'server', label: 'Server', description: 'Host, port, and security settings.' },
];

type Status =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'success' }
  | { kind: 'error'; message: string };

export function ConfigPage() {
  const [activeSection, setActiveSection] = useState<Section>('profiles');

  const [config, setConfig] = useState<AppConfigView | null>(null);
  const [credentials, setCredentials] = useState<CredentialsView | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  // Load config + credentials in parallel on mount
  useEffect(() => {
    setLoading(true);
    Promise.all([fetchConfig(), fetchCredentials()])
      .then(([cfg, creds]) => {
        setConfig(cfg);
        setCredentials(creds);
        setFetchError(null);
      })
      .catch((err: Error) => setFetchError(err.message))
      .finally(() => setLoading(false));
  }, []);

  function handleConfigChange(patch: Partial<AppConfigView>) {
    setConfig((prev) => (prev ? { ...prev, ...patch } : prev));
  }

  function handleCredentialsChange(patch: Partial<CredentialsView>) {
    setCredentials((prev) => (prev ? { ...prev, ...patch } : prev));
  }

  async function handleSave() {
    if (!config || !credentials) return;
    setStatus({ kind: 'saving' });
    try {
      const [updatedConfig, updatedCreds] = await Promise.all([
        patchConfig(config),
        patchCredentials(credentials),
      ]);
      setConfig(updatedConfig);
      setCredentials(updatedCreds);
      setStatus({ kind: 'success' });
      setTimeout(() => setStatus({ kind: 'idle' }), 3000);
    } catch (err) {
      setStatus({ kind: 'error', message: err instanceof Error ? err.message : 'Unknown error' });
    }
  }

  async function handleReload() {
    setLoading(true);
    setFetchError(null);
    try {
      const [cfg, creds] = await Promise.all([fetchConfig(), fetchCredentials()]);
      setConfig(cfg);
      setCredentials(creds);
      setStatus({ kind: 'idle' });
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  // Loading skeleton
  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-muted-foreground animate-pulse">Loading configuration…</p>
      </div>
    );
  }

  // Fetch error
  if (fetchError || !config || !credentials) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        <p className="text-sm text-destructive">{fetchError ?? 'Failed to load configuration.'}</p>
        <Button size="sm" variant="outline" onClick={handleReload}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="flex-1 w-full min-w-0 flex h-full bg-background overflow-hidden">
      {/* Sidebar */}
      <aside className="w-[260px] shrink-0 border-r border-border/50 p-4 space-y-4 overflow-y-auto">
        <div className="space-y-1">
          <p className="text-lg font-semibold flex items-center gap-2">
            <Settings2Icon className="h-5 w-5 text-primary" />
            Configuration
          </p>
          <p className="text-xs text-muted-foreground">View and edit app settings.</p>
        </div>

        <div className="space-y-2">
          {SECTIONS.map((section) => (
            <button
              key={section.key}
              type="button"
              onClick={() => setActiveSection(section.key)}
              className={`w-full text-left rounded-md border p-3 transition-colors ${
                activeSection === section.key
                  ? 'border-border bg-muted/50'
                  : 'border-border/40 bg-background hover:bg-muted/30'
              }`}
            >
              <p className="font-medium text-sm">{section.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{section.description}</p>
            </button>
          ))}
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 min-w-0 p-6 md:p-8 overflow-y-auto">
        <Card className="bg-card border-border/70">
          <CardHeader className="flex flex-row items-start justify-between">
            <div>
              <CardTitle className="text-lg">
                {SECTIONS.find((s) => s.key === activeSection)?.label}
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                {SECTIONS.find((s) => s.key === activeSection)?.description}
              </p>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {activeSection === 'profiles' && <ConfigSectionProfiles />}
            {activeSection === 'credentials' && (
              <ConfigSectionCredentials
                credentials={credentials}
                onChange={handleCredentialsChange}
              />
            )}
            {activeSection === 'server' && (
              <ConfigSectionServer config={config} onChange={handleConfigChange} />
            )}

            {/* Footer */}
            {activeSection !== 'profiles' && (
              <div className="flex items-center justify-between border-t border-border/50 pt-4">
                <div>
                  {status.kind === 'saving' && (
                    <Badge variant="secondary" className="text-xs animate-pulse">
                      Saving…
                    </Badge>
                  )}
                  {status.kind === 'success' && (
                    <Badge variant="secondary" className="text-xs text-green-600">
                      Saved
                    </Badge>
                  )}
                  {status.kind === 'error' && (
                    <Badge variant="destructive" className="text-xs">
                      {status.message}
                    </Badge>
                  )}
                  {status.kind === 'idle' && (
                    <p className="text-xs text-muted-foreground">No pending operation.</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleReload}
                    disabled={status.kind === 'saving'}
                  >
                    Reload
                  </Button>
                  <Button size="sm" onClick={handleSave} disabled={status.kind === 'saving'}>
                    Save
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

export default ConfigPage;
