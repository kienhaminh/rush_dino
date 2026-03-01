export const APP_VIEWS = ['chat', 'settings'] as const;

export type AppView = (typeof APP_VIEWS)[number];

export const CHAT_VIEW: AppView = 'chat';
export const SETTINGS_VIEW: AppView = 'settings';
export const DEFAULT_APP_VIEW: AppView = CHAT_VIEW;

export const DEFAULT_PROVIDER = 'ollama';
export const DEFAULT_MODEL = 'llama3.2:latest';

export const PROVIDER_OPTIONS = [
  { value: 'ollama', label: 'Ollama' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
] as const;

export const UNTITLED_CONVERSATION_TITLE = 'Untitled';
