import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  SparklesIcon,
  HeartIcon,
  MessageSquareIcon,
  ShieldIcon,
  PlusIcon,
  XIcon,
  EditIcon,
  CheckIcon,
} from 'lucide-react';
import type { AgentRuntimeData, AgentSoulData } from './agent-types';

type AgentSoulPanelProps = {
  runtime: AgentRuntimeData;
};

export function AgentSoulPanel({ runtime }: AgentSoulPanelProps) {
  const [draft, setDraft] = useState<AgentSoulData>({ ...runtime.soul });
  const [newValue, setNewValue] = useState('');
  const [editingTraitId, setEditingTraitId] = useState<string | null>(null);
  const [editTraitLabel, setEditTraitLabel] = useState('');
  const [editTraitDesc, setEditTraitDesc] = useState('');
  const [dirty, setDirty] = useState(false);

  function update<K extends keyof AgentSoulData>(key: K, value: AgentSoulData[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  }

  function addValue() {
    const trimmed = newValue.trim();
    if (!trimmed) return;
    update('coreValues', [...draft.coreValues, trimmed]);
    setNewValue('');
  }

  function removeValue(idx: number) {
    update(
      'coreValues',
      draft.coreValues.filter((_, i) => i !== idx),
    );
  }

  function startEditTrait(id: string) {
    const trait = draft.traits.find((t) => t.id === id);
    if (!trait) return;
    setEditingTraitId(id);
    setEditTraitLabel(trait.label);
    setEditTraitDesc(trait.description);
  }

  function commitTraitEdit() {
    if (!editingTraitId) return;
    update(
      'traits',
      draft.traits.map((t) =>
        t.id === editingTraitId ? { ...t, label: editTraitLabel, description: editTraitDesc } : t,
      ),
    );
    setEditingTraitId(null);
  }

  function removeTrait(id: string) {
    update(
      'traits',
      draft.traits.filter((t) => t.id !== id),
    );
  }

  function addTrait() {
    const id = `t${Date.now()}`;
    update('traits', [
      ...draft.traits,
      { id, label: 'New Trait', description: 'Describe this behavioral trait.' },
    ]);
    startEditTrait(id);
  }

  return (
    <div className="space-y-6">
      {/* Persona + Tone */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-card border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <SparklesIcon className="w-4 h-4 text-primary" />
              Persona
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Short description of who this agent is at its core.
            </p>
          </CardHeader>
          <CardContent>
            <Textarea
              value={draft.persona}
              onChange={(e) => update('persona', e.target.value)}
              className="min-h-[80px] text-sm resize-none bg-background/50 border-border/40"
              placeholder="Describe the agent's core persona…"
            />
          </CardContent>
        </Card>

        <Card className="bg-card border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquareIcon className="w-4 h-4 text-primary" />
              Tone & Style
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              How this agent communicates — voice, register, and style.
            </p>
          </CardHeader>
          <CardContent>
            <Textarea
              value={draft.tone}
              onChange={(e) => update('tone', e.target.value)}
              className="min-h-[80px] text-sm resize-none bg-background/50 border-border/40"
              placeholder="e.g. Direct, concise, action-oriented. Minimal fluff."
            />
          </CardContent>
        </Card>
      </div>

      {/* Core Values */}
      <Card className="bg-card border-border/50">
        <CardHeader className="flex flex-row justify-between items-start pb-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <HeartIcon className="w-4 h-4 text-primary" />
              Core Values
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Guiding principles this agent prioritizes in every decision.
            </p>
          </div>
          <Badge variant="outline" className="font-mono border-border/50 bg-muted/40 h-6 text-xs">
            {draft.coreValues.length} values
          </Badge>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {draft.coreValues.map((val, i) => (
              <div
                key={i}
                className="flex items-center gap-1.5 bg-primary/10 border border-primary/20 text-sm rounded-full px-3 py-1 group"
              >
                <span className="text-foreground/90">{val}</span>
                <button
                  onClick={() => removeValue(i)}
                  className="text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
                >
                  <XIcon className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addValue()}
              placeholder="Add a core value…"
              className="h-8 text-sm bg-background/50 border-border/40 flex-1"
            />
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs border-border/50"
              onClick={addValue}
              disabled={!newValue.trim()}
            >
              <PlusIcon className="w-3.5 h-3.5" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Behavioral Traits */}
      <Card className="bg-card border-border/50">
        <CardHeader className="flex flex-row justify-between items-start pb-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldIcon className="w-4 h-4 text-primary" />
              Behavioral Traits
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Consistent habits and tendencies that define this agent's conduct.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs border-border/50 gap-1.5"
            onClick={addTrait}
          >
            <PlusIcon className="w-3.5 h-3.5" />
            Add Trait
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {draft.traits.map((trait) => {
              const isEditing = editingTraitId === trait.id;
              return (
                <div
                  key={trait.id}
                  className="border border-border/50 rounded-lg p-3 bg-muted/20 space-y-2 group"
                >
                  {isEditing ? (
                    <>
                      <Input
                        value={editTraitLabel}
                        onChange={(e) => setEditTraitLabel(e.target.value)}
                        className="h-7 text-sm font-semibold bg-background/70 border-border/40"
                        autoFocus
                      />
                      <Input
                        value={editTraitDesc}
                        onChange={(e) => setEditTraitDesc(e.target.value)}
                        className="h-7 text-xs bg-background/70 border-border/40"
                      />
                      <div className="flex gap-2 justify-end">
                        <Button
                          size="sm"
                          className="h-6 text-[11px] gap-1"
                          onClick={commitTraitEdit}
                        >
                          <CheckIcon className="w-3 h-3" />
                          Done
                        </Button>
                        <button
                          onClick={() => setEditingTraitId(null)}
                          className="text-xs text-muted-foreground hover:text-foreground"
                        >
                          Cancel
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold">{trait.label}</p>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => startEditTrait(trait.id)}
                            className="p-1 text-muted-foreground hover:text-foreground rounded transition-colors"
                          >
                            <EditIcon className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => removeTrait(trait.id)}
                            className="p-1 text-muted-foreground hover:text-destructive rounded transition-colors"
                          >
                            <XIcon className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">{trait.description}</p>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* System Prompt */}
      <Card className="bg-card border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">System Prompt</CardTitle>
          <p className="text-xs text-muted-foreground">
            The raw directive injected before every agent turn.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={draft.systemPrompt}
            onChange={(e) => update('systemPrompt', e.target.value)}
            className="min-h-[140px] font-mono text-xs bg-background/50 border-border/40 resize-none"
            placeholder="Enter the system prompt…"
          />
          <div className="flex justify-end gap-2 pt-1 border-t border-border/50">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              disabled={!dirty}
              onClick={() => {
                setDraft({ ...runtime.soul });
                setDirty(false);
              }}
            >
              Reset
            </Button>
            <Button size="sm" className="h-8 text-xs" disabled={!dirty}>
              Save Soul
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
