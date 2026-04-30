import type { InputFieldSpec, PendingInputRequest } from '@/api/chat'

/** Merges incoming input requests into the current list, deduplicating by requestId
 * and sorting by creation time. */
export function mergeInputRequests(
  current: PendingInputRequest[],
  incoming: PendingInputRequest[],
): PendingInputRequest[] {
  const byId = new Map<string, PendingInputRequest>()
  for (const request of current) byId.set(request.requestId, request)
  for (const request of incoming) byId.set(request.requestId, request)
  return [...byId.values()].sort((left, right) => left.createdAt.localeCompare(right.createdAt))
}

/** Builds the initial form values from field specs, applying type-appropriate defaults. */
export function createInitialInputValues(fields: InputFieldSpec[]): Record<string, unknown> {
  return Object.fromEntries(
    fields.map((field) => {
      const raw = field.defaultValue
      switch (field.type) {
        case 'multiselect':
          return [field.name, Array.isArray(raw) ? raw.filter((item) => typeof item === 'string') : []]
        case 'boolean':
          return [field.name, typeof raw === 'boolean' ? raw : false]
        case 'number':
          return [field.name, typeof raw === 'number' || typeof raw === 'string' ? raw : '']
        default:
          return [field.name, typeof raw === 'string' ? raw : '']
      }
    }),
  )
}

/** Validates and converts form values into the submission payload, throwing on validation errors. */
export function buildInputRequestSubmission(
  fields: InputFieldSpec[],
  values: Record<string, unknown>,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {}

  for (const field of fields) {
    const raw = values[field.name]

    if (field.type === 'boolean') {
      payload[field.name] = Boolean(raw)
      continue
    }

    if (field.type === 'multiselect') {
      const selected = Array.isArray(raw) ? raw.filter((item): item is string => typeof item === 'string') : []
      if (field.required && selected.length === 0) {
        throw new Error(`${field.label} is required`)
      }
      if (selected.length > 0) payload[field.name] = selected
      continue
    }

    if (field.type === 'number') {
      const value = typeof raw === 'number' ? String(raw) : typeof raw === 'string' ? raw.trim() : ''
      if (!value) {
        if (field.required) throw new Error(`${field.label} is required`)
        continue
      }
      const numeric = Number(value)
      if (Number.isNaN(numeric)) throw new Error(`${field.label} must be a number`)
      if (field.min !== undefined && numeric < field.min) {
        throw new Error(`${field.label} must be at least ${field.min}`)
      }
      if (field.max !== undefined && numeric > field.max) {
        throw new Error(`${field.label} must be at most ${field.max}`)
      }
      payload[field.name] = numeric
      continue
    }

    const value = typeof raw === 'string' ? raw.trim() : ''
    if (!value) {
      if (field.required) throw new Error(`${field.label} is required`)
      continue
    }
    if (field.minLength !== undefined && value.length < field.minLength) {
      throw new Error(`${field.label} must be at least ${field.minLength} characters`)
    }
    if (field.maxLength !== undefined && value.length > field.maxLength) {
      throw new Error(`${field.label} must be at most ${field.maxLength} characters`)
    }
    payload[field.name] = value
  }

  return payload
}
