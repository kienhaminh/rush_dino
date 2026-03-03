import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Settings2Icon, SearchIcon } from 'lucide-react';

type ConfigSection = {
  key: string;
  label: string;
  description: string;
};

const SECTIONS: ConfigSection[] = [
  { key: 'agents', label: 'Agents', description: 'Agent defaults and list routing.' },
  { key: 'channels', label: 'Channels', description: 'Messaging channel and account settings.' },
  { key: 'tools', label: 'Tools', description: 'Tool profiles, policies, and safety limits.' },
  { key: 'gateway', label: 'Gateway', description: 'Gateway host, auth, and runtime settings.' },
  { key: 'cron', label: 'Cron', description: 'Scheduled jobs and run policy.' },
];

const INITIAL_FORM: Record<string, string> = {
  'gateway.host': '127.0.0.1',
  'gateway.port': '28847',
  'agents.defaults.workspace': 'default',
  'agents.defaults.model': 'gpt-4o',
  'tools.profile': 'balanced',
  'cron.enabled': 'true',
};

export function ConfigPage() {
  const [mode, setMode] = useState<'form' | 'raw'>('form');
  const [query, setQuery] = useState('');
  const [activeSection, setActiveSection] = useState<string>('agents');
  const [form, setForm] = useState<Record<string, string>>(INITIAL_FORM);
  const [raw, setRaw] = useState(
    JSON.stringify(
      {
        gateway: { host: '127.0.0.1', port: 28847 },
        agents: { defaults: { workspace: 'default', model: 'gpt-4o' } },
        tools: { profile: 'balanced' },
        cron: { enabled: true },
      },
      null,
      2,
    ),
  );
  const [status, setStatus] = useState<string | null>(null);

  const filteredSections = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return SECTIONS;
    return SECTIONS.filter((section) =>
      [section.key, section.label, section.description].join(' ').toLowerCase().includes(term),
    );
  }, [query]);

  const formRows = useMemo(() => {
    const term = query.trim().toLowerCase();
    const rows = Object.entries(form).filter(([key]) => key.startsWith(`${activeSection}.`));
    if (!term) return rows;
    return rows.filter(([key, value]) => `${key} ${value}`.toLowerCase().includes(term));
  }, [form, activeSection, query]);

  return (
    <div className="flex-1 w-full min-w-0 flex h-full bg-background overflow-hidden">
      <aside className="w-[280px] shrink-0 border-r border-border/50 p-4 space-y-4 overflow-y-auto">
        <div className="space-y-1">
          <p className="text-lg font-semibold flex items-center gap-2">
            <Settings2Icon className="h-5 w-5 text-primary" />
            Configuration
          </p>
          <p className="text-xs text-muted-foreground">Form and raw config editing.</p>
        </div>
        <div className="relative">
          <SearchIcon className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search sections or fields"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          {filteredSections.map((section) => (
            <button
              key={section.key}
              onClick={() => setActiveSection(section.key)}
              className={`w-full text-left rounded-md border p-3 transition-colors ${
                activeSection === section.key
                  ? 'border-border bg-muted/50'
                  : 'border-border/40 bg-background hover:bg-muted/30'
              }`}
            >
              <p className="font-medium text-sm">{section.label}</p>
              <p className="text-xs text-muted-foreground mt-1">{section.description}</p>
            </button>
          ))}
        </div>
      </aside>

      <main className="flex-1 min-w-0 p-6 md:p-8 overflow-y-auto">
        <Card className="bg-card border-border/70">
          <CardHeader className="flex flex-row items-start justify-between">
            <div>
              <CardTitle className="text-lg">Config Editor</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Edit by section in form mode or switch to raw JSON.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant={mode === 'form' ? 'default' : 'outline'} size="sm" onClick={() => setMode('form')}>
                Form
              </Button>
              <Button variant={mode === 'raw' ? 'default' : 'outline'} size="sm" onClick={() => setMode('raw')}>
                Raw
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {mode === 'form' ? (
              <div className="space-y-3">
                {formRows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No fields in this section for current filter.</p>
                ) : (
                  formRows.map(([key, value]) => (
                    <label key={key} className="block space-y-1">
                      <span className="text-xs text-muted-foreground font-mono">{key}</span>
                      <Input
                        value={value}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            [key]: event.target.value,
                          }))
                        }
                      />
                    </label>
                  ))
                )}
              </div>
            ) : (
              <Textarea
                className="min-h-[420px] font-mono text-xs"
                value={raw}
                onChange={(event) => setRaw(event.target.value)}
              />
            )}

            <div className="flex items-center justify-between border-t border-border/50 pt-4">
              <div>
                {status ? (
                  <Badge variant="secondary" className="text-xs">
                    {status}
                  </Badge>
                ) : (
                  <p className="text-xs text-muted-foreground">No pending operation.</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setStatus('Config reloaded (mock).')}>
                  Reload
                </Button>
                <Button variant="outline" size="sm" onClick={() => setStatus('Config saved (mock).')}>
                  Save
                </Button>
                <Button size="sm" onClick={() => setStatus('Config applied (mock).')}>
                  Apply
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

export default ConfigPage;
