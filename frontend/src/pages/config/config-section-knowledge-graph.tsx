import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import type { AppConfigView, CredentialsView } from '@/lib/types';

interface Props {
  config: AppConfigView;
  credentials: CredentialsView;
  onConfigChange: (patch: Partial<AppConfigView>) => void;
  onCredentialsChange: (patch: Partial<CredentialsView>) => void;
}

export function ConfigSectionKnowledgeGraph({
  config,
  credentials,
  onConfigChange,
  onCredentialsChange,
}: Props) {
  const kg = config.knowledge_graph;
  const kgCreds = credentials.knowledge_graph ?? {};

  function patchKg(patch: Partial<typeof kg>) {
    onConfigChange({ knowledge_graph: { ...kg, ...patch } });
  }

  function patchCreds(patch: Partial<typeof kgCreds>) {
    onCredentialsChange({ knowledge_graph: { ...kgCreds, ...patch } });
  }

  return (
    <div className="space-y-6">
      {/* Enable toggle */}
      <div className="flex items-center justify-between rounded-md border border-border/50 p-4">
        <div className="space-y-0.5">
          <Label className="text-sm font-medium">Enable Knowledge Graph</Label>
          <p className="text-xs text-muted-foreground">
            Connect the agent to an external knowledge graph for long-term fact storage and retrieval.
          </p>
        </div>
        <Switch checked={kg.enabled} onCheckedChange={(checked) => patchKg({ enabled: checked })} />
      </div>

      {/* Connection */}
      <div className="space-y-4 rounded-md border border-border/50 p-4">
        <p className="text-sm font-medium">Connection</p>

        <div className="space-y-1">
          <Label htmlFor="kg-uri" className="text-xs">
            URI
          </Label>
          <Input
            id="kg-uri"
            placeholder="bolt://localhost:7687  or  https://fuseki.example.com/ds"
            value={kg.uri ?? ''}
            onChange={(e) => patchKg({ uri: e.target.value || undefined })}
          />
          <p className="text-xs text-muted-foreground">
            <code>bolt://</code> / <code>neo4j://</code> → Bolt/Cypher (Neo4j, Memgraph) ·{' '}
            <code>http://</code> / <code>https://</code> → SPARQL 1.1
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="kg-username" className="text-xs">
              Username
            </Label>
            <Input
              id="kg-username"
              placeholder="neo4j"
              value={kgCreds.username ?? ''}
              onChange={(e) => patchCreds({ username: e.target.value || undefined })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="kg-password" className="text-xs">
              Password
            </Label>
            <Input
              id="kg-password"
              type="password"
              placeholder="••••••••"
              value={kgCreds.password ?? ''}
              onChange={(e) => patchCreds({ password: e.target.value || undefined })}
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor="kg-api-key" className="text-xs">
            API Key / Bearer Token
          </Label>
          <Input
            id="kg-api-key"
            type="password"
            placeholder="For SPARQL endpoints that use token auth"
            value={kgCreds.api_key ?? ''}
            onChange={(e) => patchCreds({ api_key: e.target.value || undefined })}
          />
        </div>
      </div>

      {/* Context injection */}
      <div className="space-y-4 rounded-md border border-border/50 p-4">
        <p className="text-sm font-medium">Context Injection</p>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="text-sm">Auto Context</Label>
            <p className="text-xs text-muted-foreground">
              Automatically inject relevant facts into each agent prompt.
            </p>
          </div>
          <Switch
            checked={kg.auto_context}
            onCheckedChange={(checked) => patchKg({ auto_context: checked })}
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="kg-max-facts" className="text-xs">
            Max Context Facts
          </Label>
          <Input
            id="kg-max-facts"
            type="number"
            min={1}
            max={100}
            value={kg.max_context_facts}
            onChange={(e) =>
              patchKg({ max_context_facts: parseInt(e.target.value, 10) || kg.max_context_facts })
            }
          />
          <p className="text-xs text-muted-foreground">
            Maximum number of facts to inject per prompt.
          </p>
        </div>

        <div className="space-y-1">
          <Label htmlFor="kg-max-chars" className="text-xs">
            Max Extraction Chars
          </Label>
          <Input
            id="kg-max-chars"
            type="number"
            min={500}
            value={kg.max_extraction_chars}
            onChange={(e) =>
              patchKg({
                max_extraction_chars: parseInt(e.target.value, 10) || kg.max_extraction_chars,
              })
            }
          />
          <p className="text-xs text-muted-foreground">
            Character limit for text sent to the triple extractor.
          </p>
        </div>
      </div>

      {/* Ingestion */}
      <div className="space-y-3 rounded-md border border-border/50 p-4">
        <p className="text-sm font-medium">Ingestion Sources</p>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="text-sm">Backfill on Startup</Label>
            <p className="text-xs text-muted-foreground">
              Run a full ingestion pass when the server starts.
            </p>
          </div>
          <Switch
            checked={kg.backfill_on_startup}
            onCheckedChange={(checked) => patchKg({ backfill_on_startup: checked })}
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="text-sm">Conversations</Label>
            <p className="text-xs text-muted-foreground">Extract facts from conversation messages.</p>
          </div>
          <Switch
            checked={kg.extract_from_conversations}
            onCheckedChange={(checked) => patchKg({ extract_from_conversations: checked })}
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="text-sm">Memory Files</Label>
            <p className="text-xs text-muted-foreground">
              Extract facts from SOUL.md, MEMORY.md, and other core files.
            </p>
          </div>
          <Switch
            checked={kg.extract_from_memory}
            onCheckedChange={(checked) => patchKg({ extract_from_memory: checked })}
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="text-sm">Documents</Label>
            <p className="text-xs text-muted-foreground">
              Extract facts from uploaded documents.
            </p>
          </div>
          <Switch
            checked={kg.extract_from_documents}
            onCheckedChange={(checked) => patchKg({ extract_from_documents: checked })}
          />
        </div>
      </div>
    </div>
  );
}
