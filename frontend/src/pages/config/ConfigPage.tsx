import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Settings2Icon } from 'lucide-react';
import type { AppConfigView, CredentialsView } from '@/lib/types';
import {
  useConfigQuery,
  useCredentialsQuery,
  usePatchConfigMutation,
  usePatchCredentialsMutation,
} from '../../lib/queries';
import { ConfigSectionProfiles } from './config-section-profiles';
import { ConfigSectionCredentials } from './config-section-credentials';
import { ConfigSectionServer } from './config-section-server';
import { ConfigSectionCoreFiles } from './config-section-core-files';
import { ConfigSectionKnowledgeGraph } from './config-section-knowledge-graph';
import { ConfigSectionMcpServers } from './config-section-mcp-servers';

type Section = 'profiles' | 'credentials' | 'server' | 'core-files' | 'knowledge-graph' | 'mcp-servers';

const SECTIONS: { key: Section; label: string; description: string }[] = [
  {
    key: 'profiles',
    label: 'Model Profiles',
    description: 'Manage AI accounts, models, and the default profile used by RushDino.',
  },
  { key: 'credentials', label: 'Credentials', description: 'API keys and bot tokens.' },
  { key: 'server', label: 'Server', description: 'Host, port, and security settings.' },
  {
    key: 'core-files',
    label: 'Core Files',
    description: 'View and edit the core memory files injected into every agent session.',
  },
  {
    key: 'knowledge-graph',
    label: 'Knowledge Graph',
    description: 'Connect to an external knowledge graph for long-term fact storage.',
  },
  {
    key: 'mcp-servers',
    label: 'MCP Servers',
    description: 'External MCP servers connected via SSE. Tools are available to all agents automatically.',
  },
];

type Status =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'success' }
  | { kind: 'error'; message: string };

export function ConfigPage() {
  const [activeSection, setActiveSection] = useState<Section>('profiles');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  const configQuery = useConfigQuery();
  const credentialsQuery = useCredentialsQuery();
  const patchConfigMutation = usePatchConfigMutation();
  const patchCredentialsMutation = usePatchCredentialsMutation();

  const loading = configQuery.isPending || credentialsQuery.isPending;
  const error = configQuery.error?.message ?? credentialsQuery.error?.message ?? null;

  // Local copies for form editing. Synced from server data on initial load and explicit reload.
  // refetchOnWindowFocus is disabled globally (query-client.ts) so background refetches
  // cannot silently overwrite user edits.
  const [config, setConfig] = useState<AppConfigView | undefined>(configQuery.data);
  const [credentials, setCredentials] = useState<CredentialsView | undefined>(credentialsQuery.data);

  // Sync local form state when server data loads or reloads
  useEffect(() => {
    if (configQuery.data) setConfig(configQuery.data);
  }, [configQuery.data]);

  useEffect(() => {
    if (credentialsQuery.data) setCredentials(credentialsQuery.data);
  }, [credentialsQuery.data]);

  function handleConfigChange(patch: Partial<AppConfigView>) {
    if (!config) return;
    setConfig({ ...config, ...patch });
  }

  function handleCredentialsChange(patch: Partial<CredentialsView>) {
    if (!credentials) return;
    setCredentials({ ...credentials, ...patch });
  }

  async function handleSave() {
    if (!config || !credentials) return;
    setStatus({ kind: 'saving' });
    try {
      await Promise.all([
        patchConfigMutation.mutateAsync(config),
        patchCredentialsMutation.mutateAsync(credentials),
      ]);
      setStatus({ kind: 'success' });
      setTimeout(() => setStatus({ kind: 'idle' }), 3000);
    } catch (err) {
      setStatus({ kind: 'error', message: err instanceof Error ? err.message : 'Unknown error' });
    }
  }

  async function handleReload() {
    setStatus({ kind: 'idle' });
    await Promise.all([configQuery.refetch(), credentialsQuery.refetch()]);
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
  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        <p className="text-sm text-destructive">{error}</p>
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
          <CardHeader>
            <CardTitle className="text-lg">
              {SECTIONS.find((s) => s.key === activeSection)?.label}
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-4">
            {activeSection === 'profiles' && <ConfigSectionProfiles />}
            {activeSection === 'credentials' && credentials && (
              <ConfigSectionCredentials
                credentials={credentials}
                onChange={handleCredentialsChange}
              />
            )}
            {activeSection === 'server' && config && (
              <ConfigSectionServer config={config} onChange={handleConfigChange} />
            )}
            {activeSection === 'core-files' && <ConfigSectionCoreFiles />}
            {activeSection === 'knowledge-graph' && config && credentials && (
              <ConfigSectionKnowledgeGraph
                config={config}
                credentials={credentials}
                onConfigChange={handleConfigChange}
                onCredentialsChange={handleCredentialsChange}
              />
            )}
            {activeSection === 'mcp-servers' && config && (
              <ConfigSectionMcpServers config={config} onConfigChange={handleConfigChange} />
            )}

            {/* Footer */}
            {activeSection !== 'profiles' && activeSection !== 'core-files' && (
              <div className="flex items-center justify-between border-t border-border/50 pt-4">
                <div>
                  {status.kind === 'saving' && (
                    <Badge variant="secondary" className="text-xs animate-pulse">
                      Saving…
                    </Badge>
                  )}
                  {status.kind === 'success' && (
                    <Badge variant="secondary" className="text-xs text-success">
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
                  <Button size="sm" onClick={handleSave} disabled={status.kind === 'saving' || patchConfigMutation.isPending || patchCredentialsMutation.isPending}>
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
