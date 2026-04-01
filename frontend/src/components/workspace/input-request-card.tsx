import { useEffect, useReducer } from 'react';
import { Eye, EyeOff } from 'lucide-react';

import { resolveInputRequest } from '@/lib/api';
import type { ConversationItem, InputFieldSpec } from '@/lib/types';
import type { InputRequestSpec } from '@/lib/types';
import {
  buildInitialInputValues,
  describeInputRequestSubmitError,
  normalizeAndValidateInputValues,
} from './input-request-utils';

type CardState = {
  values: Record<string, unknown>;
  errors: Record<string, string>;
  submitError: string | null;
  submitting: boolean;
  revealed: Record<string, boolean>;
};

type CardAction =
  | { type: 'reset'; spec: InputRequestSpec }
  | { type: 'setValues'; values: Record<string, unknown> }
  | { type: 'setErrors'; errors: Record<string, string> }
  | { type: 'setSubmitError'; error: string | null }
  | { type: 'setSubmitting'; submitting: boolean }
  | { type: 'toggleReveal'; field: string };

function cardReducer(state: CardState, action: CardAction): CardState {
  switch (action.type) {
    case 'reset': return {
      values: buildInitialInputValues(action.spec),
      errors: {},
      submitError: null,
      submitting: false,
      revealed: {},
    };
    case 'setValues': return { ...state, values: action.values };
    case 'setErrors': return { ...state, errors: action.errors };
    case 'setSubmitError': return { ...state, submitError: action.error };
    case 'setSubmitting': return { ...state, submitting: action.submitting };
    case 'toggleReveal': return { ...state, revealed: { ...state.revealed, [action.field]: !state.revealed[action.field] } };
  }
}
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
  const [state, dispatch] = useReducer(cardReducer, undefined, () => ({
    values: buildInitialInputValues(item.payload.spec),
    errors: {},
    submitError: null,
    submitting: false,
    revealed: {},
  }));

  const { values, errors, submitError, submitting, revealed } = state;

  // Reset all card state when the request changes (single dispatch replaces 5 setState calls)
  useEffect(() => {
    dispatch({ type: 'reset', spec: item.payload.spec });
  }, [item.requestId, item.payload.spec]);

  const isPending = item.status === 'pending';

  async function handleSubmit() {
    const normalized = normalizeAndValidateInputValues(item.payload.spec, values);
    dispatch({ type: 'setErrors', errors: normalized.errors });
    if (Object.keys(normalized.errors).length > 0) {
      return;
    }
    dispatch({ type: 'setSubmitting', submitting: true });
    dispatch({ type: 'setSubmitError', error: null });
    try {
      await resolveInputRequest(item.requestId, {
        status: 'submitted',
        values: normalized.values as Record<string, unknown>,
      });
      onResolved?.(item.requestId, 'submitted', normalized.values as Record<string, unknown>);
    } catch (error) {
      dispatch({ type: 'setSubmitError', error: describeInputRequestSubmitError(error) });
    } finally {
      dispatch({ type: 'setSubmitting', submitting: false });
    }
  }

  async function handleCancel() {
    dispatch({ type: 'setSubmitting', submitting: true });
    dispatch({ type: 'setSubmitError', error: null });
    try {
      await resolveInputRequest(item.requestId, { status: 'cancelled' });
      onResolved?.(item.requestId, 'cancelled', null);
    } catch (error) {
      dispatch({ type: 'setSubmitError', error: describeInputRequestSubmitError(error) });
    } finally {
      dispatch({ type: 'setSubmitting', submitting: false });
    }
  }

  function updateValue(name: string, nextValue: unknown) {
    const nextValues = { ...values, [name]: nextValue };
    dispatch({ type: 'setValues', values: nextValues });
    if (name in errors) {
      const nextErrors = { ...errors };
      delete nextErrors[name];
      dispatch({ type: 'setErrors', errors: nextErrors });
    }
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
                      onClick={() => dispatch({ type: 'toggleReveal', field: field.name })}
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
