import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PlusIcon, Trash2Icon, PlayIcon, GripVerticalIcon } from 'lucide-react';
import type { AgentRecord } from '@/pages/agents/agent-types';

export type WorkflowStepDraft = {
  key: string;
  name: string;
  instructions: string;
  agentId: string;
};

export type WorkflowDraft = {
  id: string | null;
  name: string;
  description: string;
  source: 'manual' | 'agent';
  status: 'draft' | 'active';
  createdBy: string;
  steps: WorkflowStepDraft[];
};

interface WorkflowEditorPanelProps {
  value: WorkflowDraft | null;
  agents: AgentRecord[];
  saving: boolean;
  deleting: boolean;
  running: boolean;
  onChange: (next: WorkflowDraft) => void;
  onSave: () => void;
  onDelete: () => void;
  onRun: () => void;
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export function WorkflowEditorPanel({
  value,
  agents,
  saving,
  deleting,
  running,
  onChange,
  onSave,
  onDelete,
  onRun,
}: WorkflowEditorPanelProps) {
  const [dragKey, setDragKey] = useState<string | null>(null);

  const agentOptions = useMemo(() => {
    return agents.map((agent) => ({ id: agent.id, label: agent.name }));
  }, [agents]);

  if (!value) {
    return (
      <div className="rounded-lg border border-border bg-card/40 p-6 text-sm text-muted-foreground">
        Select a workflow or create a new one.
      </div>
    );
  }

  const updateStep = (key: string, patch: Partial<WorkflowStepDraft>) => {
    onChange({
      ...value,
      steps: value.steps.map((step) => (step.key === key ? { ...step, ...patch } : step)),
    });
  };

  const removeStep = (key: string) => {
    onChange({ ...value, steps: value.steps.filter((step) => step.key !== key) });
  };

  const moveStep = (draggedKey: string, targetKey: string) => {
    if (draggedKey === targetKey) return;
    const next = [...value.steps];
    const from = next.findIndex((step) => step.key === draggedKey);
    const to = next.findIndex((step) => step.key === targetKey);
    if (from < 0 || to < 0) return;
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange({ ...value, steps: next });
  };

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-border bg-card/40 p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <h3 className="text-base font-semibold">Workflow Definition</h3>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px] uppercase">
                {value.source}
              </Badge>
              <Badge
                variant={value.status === 'active' ? 'secondary' : 'outline'}
                className="text-[10px] uppercase"
              >
                {value.status}
              </Badge>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onRun}
              disabled={running || value.status !== 'active' || value.steps.length === 0}
              className="h-8 px-3 rounded-md border border-border bg-secondary/50 hover:bg-secondary text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              <PlayIcon className="w-3.5 h-3.5" />
              {running ? 'Running...' : 'Run'}
            </button>
            <button
              onClick={onDelete}
              disabled={deleting || !value.id}
              className="h-8 px-3 rounded-md border border-destructive/30 text-destructive hover:bg-destructive/10 text-xs font-medium disabled:opacity-50"
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </button>
            <button
              onClick={onSave}
              disabled={saving}
              className="h-8 px-3 rounded-md bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          <label className="space-y-1.5">
            <span className="text-xs text-muted-foreground">Name</span>
            <input
              value={value.name}
              onChange={(event) => onChange({ ...value, name: event.target.value })}
              className="w-full h-9 px-3 rounded-md border border-border bg-background text-sm"
              placeholder="Workflow name"
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs text-muted-foreground">Status</span>
            <Select
              value={value.status}
              onValueChange={(val) =>
                onChange({ ...value, status: val as WorkflowDraft['status'] })
              }
            >
              <SelectTrigger className="w-full h-9 px-3 rounded-md border border-border bg-background text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">draft</SelectItem>
                <SelectItem value="active">active</SelectItem>
              </SelectContent>
            </Select>
          </label>
        </div>

        <label className="space-y-1.5 block">
          <span className="text-xs text-muted-foreground">Description</span>
          <textarea
            value={value.description}
            onChange={(event) => onChange({ ...value, description: event.target.value })}
            className="w-full min-h-20 px-3 py-2 rounded-md border border-border bg-background text-sm"
            placeholder="Describe what this workflow completes end-to-end"
          />
        </label>
      </div>

      <div className="rounded-lg border border-border bg-card/40 p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-semibold">Steps</h4>
          <button
            onClick={() =>
              onChange({
                ...value,
                steps: [
                  ...value.steps,
                  {
                    key: uid(),
                    name: `Step ${value.steps.length + 1}`,
                    instructions: '',
                    agentId: agentOptions[0]?.id ?? '',
                  },
                ],
              })
            }
            className="h-8 px-2.5 rounded-md border border-border text-xs hover:bg-muted/40 flex items-center gap-1.5"
          >
            <PlusIcon className="w-3.5 h-3.5" />
            Add step
          </button>
        </div>

        <div className="space-y-3">
          {value.steps.map((step, index) => (
            <div
              key={step.key}
              draggable
              onDragStart={() => setDragKey(step.key)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                if (dragKey) moveStep(dragKey, step.key);
                setDragKey(null);
              }}
              className="rounded-md border border-border/70 bg-background/80 p-3"
            >
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2 text-xs font-medium">
                  <GripVerticalIcon className="w-3.5 h-3.5 text-muted-foreground" />
                  Step {index + 1}
                </div>
                <button
                  onClick={() => removeStep(step.key)}
                  className="h-6 w-6 rounded border border-border hover:bg-muted/30 inline-flex items-center justify-center"
                >
                  <Trash2Icon className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                <label className="space-y-1.5">
                  <span className="text-xs text-muted-foreground">Step name</span>
                  <input
                    value={step.name}
                    onChange={(event) => updateStep(step.key, { name: event.target.value })}
                    className="w-full h-8 px-2.5 rounded-md border border-border bg-background text-sm"
                  />
                </label>
                <label className="space-y-1.5">
                  <span className="text-xs text-muted-foreground">Assigned agent</span>
                  <Select
                    value={step.agentId}
                    onValueChange={(val) => updateStep(step.key, { agentId: val })}
                  >
                    <SelectTrigger className="w-full h-8 px-2.5 rounded-md border border-border bg-background text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {agentOptions.map((agent) => (
                        <SelectItem key={agent.id} value={agent.id}>
                          {agent.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
              </div>

              <label className="space-y-1.5 block mt-3">
                <span className="text-xs text-muted-foreground">Instructions</span>
                <textarea
                  value={step.instructions}
                  onChange={(event) => updateStep(step.key, { instructions: event.target.value })}
                  className="w-full min-h-16 px-2.5 py-2 rounded-md border border-border bg-background text-sm"
                  placeholder="Instructions for this step"
                />
              </label>
            </div>
          ))}

          {value.steps.length === 0 && (
            <div className="text-xs text-muted-foreground border border-dashed border-border rounded-md p-3">
              Add at least one step to save and run this workflow.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
