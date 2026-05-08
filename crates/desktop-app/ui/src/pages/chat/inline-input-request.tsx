import { useEffect, useState } from 'react'
import { resolveInputRequest, type InputFieldSpec, type PendingInputRequest } from '@/api/chat'
import { createInitialInputValues, buildInputRequestSubmission } from './merge-input-requests'

// Shared form-control utilities for the input-request card. The legacy
// .approval-form__control rule was a 40px-min, full-width, padded box on the
// app's base surface — converted verbatim into Tailwind utilities here so
// every field type renders identically across the two themes.
const CONTROL_CLASSES =
  'w-full min-h-[40px] px-3 py-2.5 border border-border-line rounded-lg bg-bg-base text-text-primary font-[inherit]'

/** Renders a single field control based on its type spec. */
function InputFieldControl({
  field,
  value,
  disabled,
  onChange,
}: {
  field: InputFieldSpec
  value: unknown
  disabled?: boolean
  onChange: (nextValue: unknown) => void
}) {
  switch (field.type) {
    case 'textarea':
      return (
        <textarea
          className={`${CONTROL_CLASSES} min-h-[110px] resize-y`}
          value={typeof value === 'string' ? value : ''}
          placeholder={field.placeholder}
          minLength={field.minLength}
          maxLength={field.maxLength}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          rows={4}
        />
      )
    case 'select':
      return (
        <select
          className={CONTROL_CLASSES}
          value={typeof value === 'string' ? value : ''}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        >
          {!field.required && <option value="">Select an option</option>}
          {(field.options ?? []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )
    case 'multiselect': {
      const selected = Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
      return (
        <div className="flex flex-col gap-2 py-1">
          {(field.options ?? []).map((option) => {
            const checked = selected.includes(option.value)
            return (
              <label
                key={option.value}
                className="flex items-center gap-2 text-[13px] text-text-secondary"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={disabled}
                  onChange={(event) => {
                    const next = event.target.checked
                      ? [...selected, option.value]
                      : selected.filter((item) => item !== option.value)
                    onChange(next)
                  }}
                />
                <span>{option.label}</span>
              </label>
            )
          })}
        </div>
      )
    }
    case 'boolean':
      return (
        <label className="flex items-center gap-2 text-[13px] text-text-secondary pt-1">
          <input
            type="checkbox"
            checked={Boolean(value)}
            disabled={disabled}
            onChange={(event) => onChange(event.target.checked)}
          />
          <span>{field.placeholder ?? 'Enabled'}</span>
        </label>
      )
    case 'number':
      return (
        <input
          className={CONTROL_CLASSES}
          type="number"
          value={typeof value === 'number' ? String(value) : typeof value === 'string' ? value : ''}
          placeholder={field.placeholder}
          min={field.min}
          max={field.max}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        />
      )
    case 'text':
    default:
      return (
        <input
          className={CONTROL_CLASSES}
          type={field.secret ? 'password' : 'text'}
          value={typeof value === 'string' ? value : ''}
          placeholder={field.placeholder}
          minLength={field.minLength}
          maxLength={field.maxLength}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        />
      )
  }
}

/** Renders a structured input form that must be submitted before the agent can continue. */
export function InlineInputRequest({
  request,
  onResolved,
  onError,
}: {
  request: PendingInputRequest
  onResolved: (requestId: string) => void
  onError: (message: string) => void
}) {
  const spec = request.payload.spec
  const [values, setValues] = useState<Record<string, unknown>>(() =>
    createInitialInputValues(spec.fields),
  )
  const [busy, setBusy] = useState<'submitted' | 'cancelled' | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    setValues(createInitialInputValues(spec.fields))
    setBusy(null)
    setFormError(null)
  }, [request.requestId, spec.fields])

  const handleSubmit = async (status: 'submitted' | 'cancelled') => {
    setFormError(null)
    setBusy(status)
    try {
      const payload =
        status === 'submitted' ? buildInputRequestSubmission(spec.fields, values) : undefined
      await resolveInputRequest(request.requestId, status, payload)
      onResolved(request.requestId)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to resolve input request'
      setFormError(message)
      onError(message)
    } finally {
      setBusy(null)
    }
  }

  return (
    // .msg--approval is a column flex container (legacy reset). We mirror that
    // here so the surrounding stream layout (gap-5 between siblings) matches.
    <div className="flex flex-col font-sans">
      <div className="w-full p-4 bg-[rgb(34_211_200_/_0.06)] border border-[rgb(34_211_200_/_0.45)] border-l-[3px] border-l-teal-400 rounded-lg flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-3">
          <span className="font-mono text-[10px] font-bold tracking-[0.2em] text-warning">
            INPUT NEEDED
          </span>
          <span className="rd-mono text-[11px] text-text-primary">{spec.kind}</span>
        </div>
        <div className="flex flex-col gap-1.5">
          <strong className="text-sm text-text-primary">{spec.title}</strong>
          {spec.description && (
            <p className="m-0 text-[13px] text-text-secondary">{spec.description}</p>
          )}
        </div>
        <div className="flex flex-col gap-3">
          {spec.fields.map((field) => (
            <label key={field.name} className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-text-primary">
                {field.label}
                {field.required ? ' *' : ''}
              </span>
              {field.description && (
                <span className="text-xs text-text-muted">{field.description}</span>
              )}
              <InputFieldControl
                field={field}
                value={values[field.name]}
                disabled={busy !== null}
                onChange={(nextValue) =>
                  setValues((prev) => ({
                    ...prev,
                    [field.name]: nextValue,
                  }))
                }
              />
            </label>
          ))}
        </div>
        {formError && (
          <div className="rd-mono px-3.5 py-2.5 bg-[rgb(248_113_113_/_0.08)] border border-[rgb(248_113_113_/_0.3)] text-error rounded-md text-xs">
            {formError}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="btn"
            disabled={busy !== null}
            onClick={() => void handleSubmit('cancelled')}
          >
            {busy === 'cancelled' ? 'Cancelling…' : spec.cancelLabel ?? 'Cancel'}
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={busy !== null}
            onClick={() => void handleSubmit('submitted')}
          >
            {busy === 'submitted' ? 'Submitting…' : spec.submitLabel ?? 'Submit'}
          </button>
        </div>
      </div>
    </div>
  )
}
