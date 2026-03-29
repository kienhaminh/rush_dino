import type { InputFieldSpec, InputRequestSpec } from '@/lib/types';

export type InputRequestValues = Record<string, unknown>;

export interface NormalizedInputSubmission {
  values: InputRequestValues;
  errors: Record<string, string>;
}

export function buildInitialInputValues(spec: InputRequestSpec): InputRequestValues {
  const values: InputRequestValues = {};
  for (const field of spec.fields) {
    if (field.defaultValue !== undefined && field.defaultValue !== null) {
      values[field.name] = field.defaultValue;
      continue;
    }
    switch (field.type) {
      case 'multiselect':
        values[field.name] = [];
        break;
      case 'boolean':
        values[field.name] = false;
        break;
      default:
        values[field.name] = '';
        break;
    }
  }
  return values;
}

export function normalizeAndValidateInputValues(
  spec: InputRequestSpec,
  rawValues: InputRequestValues,
): NormalizedInputSubmission {
  const values: InputRequestValues = {};
  const errors: Record<string, string> = {};

  for (const field of spec.fields) {
    switch (field.type) {
      case 'text':
      case 'textarea':
      case 'select': {
        const rawValue = rawValues[field.name];
        const value = typeof rawValue === 'string' ? rawValue : '';
        const trimmed = value.trim();
        if (field.required && trimmed.length === 0) {
          errors[field.name] = 'This field is required.';
        } else if (field.minLength != null && trimmed.length > 0 && trimmed.length < field.minLength) {
          errors[field.name] = `Enter at least ${field.minLength} characters.`;
        } else if (field.maxLength != null && trimmed.length > field.maxLength) {
          errors[field.name] = `Enter no more than ${field.maxLength} characters.`;
        } else if (
          field.type === 'select' &&
          trimmed.length > 0 &&
          !field.options.some((option) => option.value === trimmed)
        ) {
          errors[field.name] = 'Choose one of the available options.';
        }
        values[field.name] = value;
        break;
      }
      case 'multiselect': {
        const rawValue = rawValues[field.name];
        const value = Array.isArray(rawValue)
          ? rawValue.filter((item): item is string => typeof item === 'string')
          : [];
        if (field.required && value.length === 0) {
          errors[field.name] = 'Select at least one option.';
        } else if (
          value.some((item) => !field.options.some((option) => option.value === item))
        ) {
          errors[field.name] = 'Choose only from the available options.';
        }
        values[field.name] = value;
        break;
      }
      case 'boolean': {
        const value = typeof rawValues[field.name] === 'boolean' ? rawValues[field.name] : false;
        values[field.name] = value;
        break;
      }
      case 'number': {
        const value = rawValues[field.name];
        const normalized = normalizeNumber(field, value);
        if (normalized.error) {
          errors[field.name] = normalized.error;
        }
        values[field.name] = normalized.value;
        break;
      }
    }
  }

  return { values, errors };
}

function normalizeNumber(field: InputFieldSpec, rawValue: unknown) {
  const empty = rawValue === '' || rawValue == null;
  if (empty) {
    return {
      value: null,
      error: field.required ? 'This field is required.' : undefined,
    };
  }

  const parsed =
    typeof rawValue === 'number'
      ? rawValue
      : typeof rawValue === 'string'
        ? Number(rawValue)
        : Number.NaN;
  if (!Number.isFinite(parsed)) {
    return { value: rawValue, error: 'Enter a valid number.' };
  }
  if (!Number.isInteger(parsed)) {
    return { value: rawValue, error: 'Enter a whole number.' };
  }
  if (field.min != null && parsed < field.min) {
    return { value: parsed, error: `Enter a value of at least ${field.min}.` };
  }
  if (field.max != null && parsed > field.max) {
    return { value: parsed, error: `Enter a value of at most ${field.max}.` };
  }
  return { value: parsed };
}
