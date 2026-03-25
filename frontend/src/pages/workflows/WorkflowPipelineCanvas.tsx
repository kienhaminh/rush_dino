import { useState } from 'react';
import { PlusIcon, Trash2Icon, ChevronRightIcon, BotIcon } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { AgentRecord } from '@/pages/agents/agent-types';
import type { WorkflowDraft, WorkflowStepDraft } from './WorkflowEditorPanel';

interface WorkflowPipelineCanvasProps {
  draft: WorkflowDraft;
  agents: AgentRecord[];
  onChange: (next: WorkflowDraft) => void;
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

// A single pipeline node card
function PipelineNode({
  step,
  index,
  agent,
  isActive,
  onClick,
}: {
  step: WorkflowStepDraft;
  index: number;
  agent: AgentRecord | undefined;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`
        w-40 rounded-xl border-2 p-3 text-left transition-all duration-150 flex-shrink-0
        ${isActive
          ? 'border-primary bg-primary/5 shadow-md shadow-primary/10'
          : 'border-border bg-card hover:border-primary/40 hover:bg-muted/20'
        }
      `}
    >
      <div className="flex items-center justify-between mb-2">
        <span className={`text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center
          ${isActive ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}
        `}>
          {index + 1}
        </span>
        <BotIcon className="w-3 h-3 text-muted-foreground/40" />
      </div>
      <p className="text-xs font-semibold truncate leading-tight">{step.name || 'Untitled step'}</p>
      <p className="text-[10px] text-muted-foreground mt-1.5 truncate">
        {agent ? `${agent.emoji ?? ''} ${agent.name}` : 'No agent'}
      </p>
    </button>
  );
}

export function WorkflowPipelineCanvas({ draft, agents, onChange }: WorkflowPipelineCanvasProps) {
  const [activeKey, setActiveKey] = useState<string | null>(draft.steps[0]?.key ?? null);

  const activeStep = draft.steps.find((s) => s.key === activeKey) ?? null;

  const updateStep = (key: string, patch: Partial<WorkflowStepDraft>) => {
    onChange({ ...draft, steps: draft.steps.map((s) => (s.key === key ? { ...s, ...patch } : s)) });
  };

  const removeStep = (key: string) => {
    const next = draft.steps.filter((s) => s.key !== key);
    onChange({ ...draft, steps: next });
    setActiveKey(next[0]?.key ?? null);
  };

  const addStep = () => {
    const key = uid();
    const newStep: WorkflowStepDraft = {
      key,
      name: `Step ${draft.steps.length + 1}`,
      instructions: '',
      agentId: agents[0]?.id ?? '',
    };
    onChange({ ...draft, steps: [...draft.steps, newStep] });
    setActiveKey(key);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Pipeline canvas */}
      <div className="overflow-x-auto border-b border-border/40 bg-muted/10">
        <div className="flex items-center px-6 py-5 gap-0 min-w-max">
          {draft.steps.map((step, index) => {
            const agent = agents.find((a) => a.id === step.agentId);
            const isActive = step.key === activeKey;
            return (
              <div key={step.key} className="flex items-center">
                <PipelineNode
                  step={step}
                  index={index}
                  agent={agent}
                  isActive={isActive}
                  onClick={() => setActiveKey(isActive ? null : step.key)}
                />
                <div className="flex items-center w-8 mx-0.5">
                  <div className="flex-1 h-px bg-border/50" />
                  <ChevronRightIcon className="w-3 h-3 text-border/50 -ml-0.5" />
                </div>
              </div>
            );
          })}

          {/* Add step node */}
          <button
            onClick={addStep}
            className="w-36 h-24 rounded-xl border-2 border-dashed border-border/50 hover:border-primary/60 hover:bg-primary/5 flex flex-col items-center justify-center gap-1.5 text-muted-foreground hover:text-primary transition-all flex-shrink-0"
          >
            <PlusIcon className="w-5 h-5" />
            <span className="text-[10px] font-medium">Add step</span>
          </button>
        </div>

        {draft.steps.length === 0 && (
          <p className="px-6 pb-4 text-xs text-muted-foreground -mt-2">
            Click "Add step" to define your pipeline.
          </p>
        )}
      </div>

      {/* Inline step editor */}
      {activeStep ? (
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              Step {draft.steps.findIndex((s) => s.key === activeKey) + 1} — Configure
            </p>
            <button
              onClick={() => removeStep(activeStep.key)}
              className="h-7 px-2.5 rounded-md border border-destructive/30 text-destructive/70 hover:text-destructive hover:bg-destructive/10 text-xs flex items-center gap-1.5 transition-colors"
            >
              <Trash2Icon className="w-3 h-3" />
              Remove
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="space-y-1.5">
              <span className="text-[11px] text-muted-foreground">Step name</span>
              <input
                value={activeStep.name}
                onChange={(e) => updateStep(activeStep.key, { name: e.target.value })}
                className="w-full h-8 px-2.5 rounded-md border border-border bg-background text-sm"
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-[11px] text-muted-foreground">Assigned agent</span>
              <Select
                value={activeStep.agentId}
                onValueChange={(val) => updateStep(activeStep.key, { agentId: val })}
              >
                <SelectTrigger className="w-full h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {agents.map((agent) => (
                    <SelectItem key={agent.id} value={agent.id}>
                      {agent.emoji} {agent.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          </div>

          <label className="space-y-1.5 block">
            <span className="text-[11px] text-muted-foreground">Instructions</span>
            <textarea
              value={activeStep.instructions}
              onChange={(e) => updateStep(activeStep.key, { instructions: e.target.value })}
              rows={4}
              className="w-full px-2.5 py-2 rounded-md border border-border bg-background text-sm resize-none"
              placeholder="Instructions for this step..."
            />
          </label>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground">
          {draft.steps.length > 0 ? 'Click a step to configure it.' : ''}
        </div>
      )}
    </div>
  );
}
