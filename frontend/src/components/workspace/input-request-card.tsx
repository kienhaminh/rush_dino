import { useEffect, useState } from 'react';

import { resolveInputRequest } from '@/lib/api';
import type { ConversationItem } from '@/lib/types';
import { buildInitialInputValues, normalizeAndValidateInputValues } from './input-request-utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

type InputRequestItem = Extract<ConversationItem, { kind: 'input_request' }>;

interface InputRequestCardProps {
  item: InputRequestItem;
  onResolved?: (
    requestId: string,
    status: 'submitted' | 'cancelled',
    values?: Record<string, unknown> | null,
  ) => void;
}

export function InputRequestCard({ item, onResolved }: InputRequestCardProps) {
  const [values, setValues] = useState(() => buildInitialInputValues(item.payload.spec));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setValues(buildInitialInputValues(item.payload.spec));
    setErrors({});
    setSubmitError(null);
    setSubmitting(false);
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
      setSubmitError(error instanceof Error ? error.message : 'Failed to submit input request.');
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
      setSubmitError(error instanceof Error ? error.message : 'Failed to cancel input request.');
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

  return (
    <div className="flex justify-start py-2">
      <div className="w-full max-w-[85%] rounded-2xl border border-primary/20 bg-primary/[0.04] px-4 py-4 shadow-sm">
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
                  <Input
                    id={`${item.requestId}-${field.name}`}
                    value={typeof value === 'string' ? value : ''}
                    placeholder={field.placeholder ?? undefined}
                    onChange={(event) => updateValue(field.name, event.target.value)}
                    disabled={!isPending || submitting}
                  />
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
      </div>
    </div>
  );
}
