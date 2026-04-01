import { describe, expect, it } from 'vitest';

import type { InputRequestSpec } from '@/lib/types';
import {
  buildInitialInputValues,
  describeInputRequestSubmitError,
  normalizeAndValidateInputValues,
} from './input-request-utils';

const sampleSpec: InputRequestSpec = {
  kind: 'form',
  title: 'Project details',
  description: 'Tell me what to build.',
  fields: [
    {
      name: 'projectName',
      label: 'Project name',
      type: 'text',
      required: true,
      minLength: 3,
      maxLength: 40,
      options: [],
    },
    {
      name: 'surface',
      label: 'Surface',
      type: 'select',
      required: true,
      options: [
        { label: 'Web', value: 'web' },
        { label: 'Mobile Gateway', value: 'mobile-gateway' },
      ],
    },
    {
      name: 'targets',
      label: 'Targets',
      type: 'multiselect',
      required: false,
      options: [
        { label: 'API', value: 'api' },
        { label: 'UI', value: 'ui' },
      ],
    },
    {
      name: 'iterations',
      label: 'Iterations',
      type: 'number',
      required: true,
      min: 1,
      max: 5,
      options: [],
    },
    {
      name: 'approved',
      label: 'Approved',
      type: 'boolean',
      required: false,
      options: [],
    },
  ],
};

describe('input-request-utils', () => {
  it('builds initial values for all supported field types', () => {
    const values = buildInitialInputValues(sampleSpec);

    expect(values).toEqual({
      projectName: '',
      surface: '',
      targets: [],
      iterations: '',
      approved: false,
    });
  });

  it('validates required fields and coerces number values', () => {
    const result = normalizeAndValidateInputValues(sampleSpec, {
      projectName: 'Ru',
      surface: 'expo',
      targets: ['ui'],
      iterations: '8',
      approved: true,
    });

    expect(result.errors).toEqual({
      projectName: 'Enter at least 3 characters.',
      surface: 'Choose one of the available options.',
      iterations: 'Enter a value of at most 5.',
    });
    expect(result.values.iterations).toBe(8);
    expect(result.values.targets).toEqual(['ui']);
    expect(result.values.approved).toBe(true);
  });

  it('maps missing input-request errors to an expired-request message', () => {
    const error = new Error("not found: input request 'dfa19fdc-dce9-47b1-a5b4-a707ddc5a492' not found");

    expect(describeInputRequestSubmitError(error)).toBe(
      'This request is no longer active. The server may have restarted. Ask the agent to request it again.',
    );
  });
});
