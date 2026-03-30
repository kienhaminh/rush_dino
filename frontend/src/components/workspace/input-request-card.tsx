import { useEffect, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

import { resolveInputRequest } from '@/lib/api';
import type { ConversationItem, InputFieldSpec } from '@/lib/types';
import {
  buildInitialInputValues,
  describeInputRequestSubmitError,
  normalizeAndValidateInputValues,
} from './input-request-utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

/** Returns true when a field should be treated as a secret (masked) input.
 *  Explicit `secret: true` takes priority; otherwise common keyword heuristics apply. */
function isSecretField(field: InputFieldSpec): boolean {
  if (field.secret) return true;
  const haystack = `${field.name} ${field.label}`.toLowerCase();
  return /\b(api[_\s-]?key|password|passwd|secret|token|credential|auth[_\s-]?key|private[_\s-]?key|access[_\s-]?key)\b/.test(haystack);
}

type InputRequestItem = Extract<ConversationItem, { kind: 'input_request' }>;

interface InputRequestCardProps {
  item: InputRequestItem;
  /** When true, renders as a full-width centered block instead of a left-aligned chat bubble. */
  standalone?: boolean;
  onResolved?: (
    requestId: string,
    status: 'submitted' | 'cancelled',
    values?: Record<string, unknown> | null,
  ) => void;
}

export function InputRequestCard({ item, standalone, onResolved }: InputRequestCardProps) {
  const [values, setValues] = useState(() => buildInitialInputValues(item.payload.spec));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Tracks which secret fields the user has chosen to reveal
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setValues(buildInitialInputValues(item.payload.spec));
    setErrors({});
    setSubmitError(null);
    setSubmitting(false);
    setRevealed({});
  }, [item.requestId, item.payload.spec]);

  const isPending = item.status === 'pending';

  async function handleSubmit() {
    const normalized = normalizeAndValidateInputValues(item.payload.spec, values);
    setErrors(normalized.errors);
    if (Object.keys(normalized.errors).length > 0) {
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      await resolveInputRequest(item.requestId, {
        status: 'submitted',
        values: normalized.values as Record<string, unknown>,
      });
      onResolved?.(item.requestId, 'submitted', normalized.values as Record<string, unknown>);
    } catch (error) {
      setSubmitError(describeInputRequestSubmitError(error));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancel() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      await resolveInputRequest(item.requestId, { status: 'cancelled' });
      onResolved?.(item.requestId, 'cancelled', null);
    } catch (error) {
      setSubmitError(describeInputRequestSubmitError(error));
    } finally {
      setSubmitting(false);
    }
  }

  function updateValue(name: string, nextValue: unknown) {
    setValues((current) => ({ ...current, [name]: nextValue }));
    setErrors((current) => {
      if (!(name in current)) return current;
      const nextErrors = { ...current };
      delete nextErrors[name];
      return nextErrors;
    });
  }

  const cardBody = (
    <>
      <div className="space-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-primary/70">
          User Input
        </p>
        <h3 className="text-sm font-medium text-foreground">{item.payload.spec.title}</h3>
        {item.payload.spec.description ? (
          <p className="text-xs leading-5 text-muted-foreground">{item.payload.spec.description}</p>
        ) : null}
      </div>

      <div className="mt-4 space-y-4">
        {item.payload.spec.fields.map((field) => {
          const fieldError = errors[field.name];
          const value = values[field.name];
          return (
            <div key={field.name} className="space-y-2">
              <div className="space-y-1">
                <Label htmlFor={`${item.requestId}-${field.name}`} className="text-xs font-medium text-foreground/90">
                  {field.label}
                  {field.required ? ' *' : ''}
                </Label>
                {field.description ? (
                  <p className="text-[11px] text-muted-foreground">{field.description}</p>
                ) : null}
              </div>

              {field.type === 'text' ? (
                isSecretField(field) ? (
                  <div className="relative">
                    <Input
                      id={`${item.requestId}-${field.name}`}
                      type={revealed[field.name] ? 'text' : 'password'}
                      value={typeof value === 'string' ? value : ''}
                      placeholder={field.placeholder ?? undefined}
                      onChange={(event) => updateValue(field.name, event.target.value)}
                      disabled={!isPending || submitting}
                      className="pr-9"
                      autoComplete="off"
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setRevealed((prev) => ({ ...prev, [field.name]: !prev[field.name] }))}
                      className="absolute inset-y-0 right-0 flex items-center px-2.5 text-muted-foreground/50 hover:text-muted-foreground/80 transition-colors"
                      aria-label={revealed[field.name] ? 'Hide value' : 'Show value'}
                    >
                      {revealed[field.name] ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                ) : (
                  <Input
                    id={`${item.requestId}-${field.name}`}
                    value={typeof value === 'string' ? value : ''}
                    placeholder={field.placeholder ?? undefined}
                    onChange={(event) => updateValue(field.name, event.target.value)}
                    disabled={!isPending || submitting}
                  />
                )
              ) : null}

              {field.type === 'textarea' ? (
                <Textarea
                  id={`${item.requestId}-${field.name}`}
                  value={typeof value === 'string' ? value : ''}
                  placeholder={field.placeholder ?? undefined}
                  onChange={(event) => updateValue(field.name, event.target.value)}
                  disabled={!isPending || submitting}
                  className="min-h-[120px]"
                />
              ) : null}

              {field.type === 'number' ? (
                <Input
                  id={`${item.requestId}-${field.name}`}
                  type="number"
                  value={typeof value === 'number' ? String(value) : typeof value === 'string' ? value : ''}
                  placeholder={field.placeholder ?? undefined}
                  onChange={(event) => updateValue(field.name, event.target.value)}
                  disabled={!isPending || submitting}
                />
              ) : null}

              {field.type === 'boolean' ? (
                <div className="flex items-center justify-between rounded-xl border border-border/50 bg-background/60 px-3 py-2">
                  <span className="text-sm text-foreground/80">
                    {field.placeholder ?? 'Toggle your choice'}
                  </span>
                  <Switch
                    checked={Boolean(value)}
                    onCheckedChange={(checked) => updateValue(field.name, checked)}
                    disabled={!isPending || submitting}
                  />
                </div>
              ) : null}

              {field.type === 'select' ? (
                <Select
                  value={typeof value === 'string' ? value : ''}
                  onValueChange={(nextValue) => updateValue(field.name, nextValue)}
                  disabled={!isPending || submitting}
                >
                  <SelectTrigger id={`${item.requestId}-${field.name}`}>
                    <SelectValue placeholder={field.placeholder ?? 'Select an option'} />
                  </SelectTrigger>
                  <SelectContent>
                    {field.options.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}

              {field.type === 'multiselect' ? (
                <div className="space-y-2 rounded-xl border border-border/50 bg-background/60 px-3 py-3">
                  {field.options.map((option) => {
                    const selectedValues = Array.isArray(value) ? value : [];
                    const checked = selectedValues.includes(option.value);
                    return (
                      <label
                        key={option.value}
                        className="flex items-center gap-3 text-sm text-foreground/80"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={!isPending || submitting}
                          onChange={(event) => {
                            const current = Array.isArray(selectedValues) ? selectedValues : [];
                            updateValue(
                              field.name,
                              event.target.checked
                                ? [...current, option.value]
                                : current.filter((entry) => entry !== option.value),
                            );
                          }}
                        />
                        <span>{option.label}</span>
                      </label>
                    );
                  })}
                </div>
              ) : null}

              {fieldError ? (
                <p className="text-[11px] text-destructive">{fieldError}</p>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {isPending ? (
          <>
            <Button onClick={handleSubmit} disabled={submitting}>
              {item.payload.spec.submitLabel ?? 'Submit'}
            </Button>
            <Button variant="outline" onClick={handleCancel} disabled={submitting}>
              {item.payload.spec.cancelLabel ?? 'Cancel'}
            </Button>
          </>
        ) : (
          <div className="rounded-full border border-border/50 bg-background/60 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            {item.status === 'submitted' ? 'Submitted' : 'Cancelled'}
          </div>
        )}
        {submitError ? (
          <p className="text-[11px] text-destructive">{submitError}</p>
        ) : null}
      </div>
    </>
  );

  if (standalone) {
    return (
      <div className="w-full rounded-2xl border border-primary/20 bg-primary/[0.04] px-4 py-4 shadow-sm">
        {cardBody}
      </div>
    );
  }

  return (
    <div className="flex justify-start py-2">
      <div className="w-full max-w-[85%] rounded-2xl border border-primary/20 bg-primary/[0.04] px-4 py-4 shadow-sm">
        {cardBody}
      </div>
    </div>
  );
}
