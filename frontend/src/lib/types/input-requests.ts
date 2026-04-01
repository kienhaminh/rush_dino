export type InputRequestKind = 'question' | 'form';
export type InputFieldType =
  | 'text'
  | 'textarea'
  | 'select'
  | 'multiselect'
  | 'boolean'
  | 'number';
export type InputRequestStatus = 'submitted' | 'cancelled';

export interface InputFieldOption {
  label: string;
  value: string;
}

export interface InputFieldSpec {
  name: string;
  label: string;
  description?: string | null;
  type: InputFieldType;
  required: boolean;
  placeholder?: string | null;
  defaultValue?: unknown | null;
  min?: number | null;
  max?: number | null;
  minLength?: number | null;
  maxLength?: number | null;
  options: InputFieldOption[];
  /** When true the UI renders this field as a masked password input. */
  secret?: boolean | null;
}

export interface InputRequestSpec {
  kind: InputRequestKind;
  title: string;
  description?: string | null;
  submitLabel?: string | null;
  cancelLabel?: string | null;
  fields: InputFieldSpec[];
}

export interface InputRequestPayload {
  spec: InputRequestSpec;
}

export interface PendingInputRequest {
  requestId: string;
  sessionId: string;
  conversationId: string;
  runId?: string | null;
  payload: InputRequestPayload;
  createdAt: string;
}
