export interface SoulMemoryFile {
  name: string;
  path: string;
  exists: boolean;
  updatedAt?: string | null;
  sizeBytes: number;
  lineCount: number;
  content: string;
}

export interface RegisteredTool {
  name: string;
  description: string;
  /** True = active from session start. False = pool-only, activated on demand via tool_search. */
  isCore: boolean;
}

export interface InjectedContextFile {
  label: string;
  content: string;
  truncated: boolean;
  originalLen: number;
}

export interface SoulMemoryStateResponse {
  dataDir: string;
  bootstrap: SoulMemoryFile;
  soul: SoulMemoryFile;
  memory: SoulMemoryFile;
  identityFiles: SoulMemoryFile[];
  dailyFiles: SoulMemoryFile[];
  /** Files as actually injected into the system prompt (truncation applied). */
  injectedContext: InjectedContextFile[];
  truncationWarnings: string[];
}
