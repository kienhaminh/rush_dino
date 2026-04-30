import { useEffect, useState } from 'react'
import { resolveInputRequest, type InputFieldSpec, type PendingInputRequest } from '@/api/chat'
import { createInitialInputValues, buildInputRequestSubmission } from './merge-input-requests'

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
          className="approval-form__control approval-form__control--textarea"
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
          className="approval-form__control"
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
        <div className="approval-form__choices">
          {(field.options ?? []).map((option) => {
            const checked = selected.includes(option.value)
            return (
              <label key={option.value} className="approval-form__choice">
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
        <label className="approval-form__choice approval-form__choice--single">
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
          className="approval-form__control"
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
          className="approval-form__control"
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
    <div className="msg msg--approval">
      <div className="approval-card approval-card--input">
        <div className="approval-card__head">
          <span className="approval-card__label">INPUT NEEDED</span>
          <span className="approval-card__tool rd-mono">{spec.kind}</span>
        </div>
        <div className="approval-card__content">
          <strong className="approval-card__title">{spec.title}</strong>
          {spec.description && <p className="approval-card__prompt">{spec.description}</p>}
        </div>
        <div className="approval-form">
          {spec.fields.map((field) => (
            <label key={field.name} className="approval-form__field">
              <span className="approval-form__label">
                {field.label}
                {field.required ? ' *' : ''}
              </span>
              {field.description && (
                <span className="approval-form__hint">{field.description}</span>
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
        {formError && <div className="chat-error-banner rd-mono">{formError}</div>}
        <div className="approval-card__actions">
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
