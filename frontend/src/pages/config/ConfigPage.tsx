import { useEffect, useReducer, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Settings2Icon } from 'lucide-react';
import { fetchConfig, fetchCredentials, patchConfig, patchCredentials } from '@/lib/api';
import type { AppConfigView, CredentialsView } from '@/lib/types';
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

// Reducer for the fetch lifecycle: loading → ready | error
type FetchState =
  | { status: 'loading' }
  | { status: 'ready'; config: AppConfigView; credentials: CredentialsView }
  | { status: 'error'; error: string };

type FetchAction =
  | { type: 'start' }
  | { type: 'success'; config: AppConfigView; credentials: CredentialsView }
  | { type: 'error'; error: string }
  | { type: 'setConfig'; config: AppConfigView }
  | { type: 'setCredentials'; credentials: CredentialsView };

function fetchReducer(state: FetchState, action: FetchAction): FetchState {
  switch (action.type) {
    case 'start':
      return { status: 'loading' };
    case 'success':
      return { status: 'ready', config: action.config, credentials: action.credentials };
    case 'error':
      return { status: 'error', error: action.error };
    case 'setConfig':
      return state.status === 'ready' ? { ...state, config: action.config } : state;
    case 'setCredentials':
      return state.status === 'ready' ? { ...state, credentials: action.credentials } : state;
  }
}

export function ConfigPage() {
  const [activeSection, setActiveSection] = useState<Section>('profiles');
  const [fetchState, dispatch] = useReducer(fetchReducer, { status: 'loading' });
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  // Load config + credentials in parallel on mount
  useEffect(() => {
    dispatch({ type: 'start' });
    Promise.all([fetchConfig(), fetchCredentials()])
      .then(([cfg, creds]) => dispatch({ type: 'success', config: cfg, credentials: creds }))
      .catch((err: Error) => dispatch({ type: 'error', error: err.message }));
  }, []);

  function handleConfigChange(patch: Partial<AppConfigView>) {
    if (fetchState.status !== 'ready') return;
    dispatch({ type: 'setConfig', config: { ...fetchState.config, ...patch } });
  }

  function handleCredentialsChange(patch: Partial<CredentialsView>) {
    if (fetchState.status !== 'ready') return;
    dispatch({ type: 'setCredentials', credentials: { ...fetchState.credentials, ...patch } });
  }

  async function handleSave() {
    if (fetchState.status !== 'ready') return;
    const { config, credentials } = fetchState;
    setStatus({ kind: 'saving' });
    try {
      const [updatedConfig, updatedCreds] = await Promise.all([
        patchConfig(config),
        patchCredentials(credentials),
      ]);
      dispatch({ type: 'success', config: updatedConfig, credentials: updatedCreds });
      setStatus({ kind: 'success' });
      setTimeout(() => setStatus({ kind: 'idle' }), 3000);
    } catch (err) {
      setStatus({ kind: 'error', message: err instanceof Error ? err.message : 'Unknown error' });
    }
  }

  async function handleReload() {
    dispatch({ type: 'start' });
    try {
      const [cfg, creds] = await Promise.all([fetchConfig(), fetchCredentials()]);
      dispatch({ type: 'success', config: cfg, credentials: creds });
      setStatus({ kind: 'idle' });
    } catch (err) {
      dispatch({ type: 'error', error: err instanceof Error ? err.message : 'Unknown error' });
    }
  }

  // Loading skeleton
  if (fetchState.status === 'loading') {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-muted-foreground animate-pulse">Loading configuration…</p>
      </div>
    );
  }

  // Fetch error
  if (fetchState.status === 'error') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        <p className="text-sm text-destructive">{fetchState.error}</p>
        <Button size="sm" variant="outline" onClick={handleReload}>
          Retry
        </Button>
      </div>
    );
  }

  // At this point fetchState.status === 'ready'
  const { config, credentials } = fetchState;

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
            {activeSection === 'core-files' && <ConfigSectionCoreFiles />}
            {activeSection === 'knowledge-graph' && (
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
