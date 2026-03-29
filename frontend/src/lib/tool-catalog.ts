// Canonical ordered list of tool sections shown in the UI.
// Order here determines display order in AgentToolsPanel.
export const CORE_TOOL_SECTION_ORDER: Array<{ id: string; label: string }> = [
  { id: 'fs', label: 'Files' },
  { id: 'runtime', label: 'Runtime' },
  { id: 'web', label: 'Web' },
  { id: 'memory', label: 'Memory' },
  { id: 'sessions', label: 'Sessions' },
  { id: 'agents', label: 'Agents' },
  { id: 'skills', label: 'Skills' },
  { id: 'messaging', label: 'Messaging' },
  { id: 'automation', label: 'Automation' },
];

export type ToolProfile = 'minimal' | 'coding' | 'messaging';

export type CoreToolDefinition = {
  // Must match the tool name returned by the backend
  id: string;
  label: string;
  description: string;
  sectionId: string;
  // Which profiles include this tool by default
  profiles: ToolProfile[];
};

// Flat list of all core tools. Section membership is declared inline via sectionId.
export const CORE_TOOL_DEFINITIONS: CoreToolDefinition[] = [
  // ── Files ────────────────────────────────────────────────────────────────
  {
    id: 'read',
    label: 'read',
    description: 'Read file contents',
    sectionId: 'fs',
    profiles: ['coding'],
  },
  {
    id: 'write',
    label: 'write',
    description: 'Create or overwrite files',
    sectionId: 'fs',
    profiles: ['coding'],
  },
  {
    id: 'edit',
    label: 'edit',
    description: 'Make precise edits to files',
    sectionId: 'fs',
    profiles: ['coding'],
  },

  // ── Runtime ──────────────────────────────────────────────────────────────
  {
    id: 'bash',
    label: 'bash',
    description: 'Execute bash commands and return output',
    sectionId: 'runtime',
    profiles: ['coding'],
  },

  // ── Web ──────────────────────────────────────────────────────────────────
  {
    id: 'web_search',
    label: 'web_search',
    description: 'Search the web',
    sectionId: 'web',
    profiles: ['coding'],
  },
  {
    id: 'web_fetch',
    label: 'web_fetch',
    description: 'Fetch web content',
    sectionId: 'web',
    profiles: ['coding'],
  },

  // ── Memory ───────────────────────────────────────────────────────────────
  {
    id: 'memory_search',
    label: 'memory_search',
    description: 'Semantic memory search',
    sectionId: 'memory',
    profiles: ['coding'],
  },
  {
    id: 'memory_write',
    label: 'memory_write',
    description: 'Write to memory',
    sectionId: 'memory',
    profiles: ['coding'],
  },
  {
    id: 'knowledge_graph',
    label: 'knowledge_graph',
    description: 'Query the knowledge graph',
    sectionId: 'memory',
    profiles: ['coding'],
  },

  // ── Sessions ─────────────────────────────────────────────────────────────
  {
    id: 'sessions_list',
    label: 'sessions_list',
    description: 'List active sessions',
    sectionId: 'sessions',
    profiles: ['coding', 'messaging'],
  },
  {
    id: 'sessions_history',
    label: 'sessions_history',
    description: 'Read session history',
    sectionId: 'sessions',
    profiles: ['coding', 'messaging'],
  },
  {
    id: 'sessions_send',
    label: 'sessions_send',
    description: 'Send a message to a session',
    sectionId: 'sessions',
    profiles: ['coding', 'messaging'],
  },
  {
    id: 'sessions_spawn',
    label: 'sessions_spawn',
    description: 'Spawn a new session',
    sectionId: 'sessions',
    profiles: ['coding'],
  },
  {
    id: 'session_status',
    label: 'session_status',
    description: 'Check session status',
    sectionId: 'sessions',
    profiles: ['minimal', 'coding', 'messaging'],
  },

  // ── Agents ───────────────────────────────────────────────────────────────
  {
    id: 'list_agents',
    label: 'list_agents',
    description: 'List available agents',
    sectionId: 'agents',
    profiles: [],
  },
  {
    id: 'delegate',
    label: 'delegate',
    description: 'Delegate a task to another agent',
    sectionId: 'agents',
    profiles: ['coding'],
  },
  {
    id: 'spawn_agents',
    label: 'spawn_agents',
    description: 'Spawn a new agent instance',
    sectionId: 'agents',
    profiles: ['coding'],
  },
  {
    id: 'subagents',
    label: 'subagents',
    description: 'Spawn a sub-agent for parallel work',
    sectionId: 'agents',
    profiles: ['coding'],
  },

  // ── Skills ───────────────────────────────────────────────────────────────
  {
    id: 'list_skills',
    label: 'list_skills',
    description: 'List available skills',
    sectionId: 'skills',
    profiles: ['coding'],
  },
  {
    id: 'read_skill',
    label: 'read_skill',
    description: 'Read a skill definition',
    sectionId: 'skills',
    profiles: ['coding'],
  },
  {
    id: 'create_skill',
    label: 'create_skill',
    description: 'Create a new skill',
    sectionId: 'skills',
    profiles: ['coding'],
  },

  // ── Messaging ────────────────────────────────────────────────────────────
  {
    id: 'message',
    label: 'message',
    description: 'Present a message to the user',
    sectionId: 'messaging',
    profiles: ['messaging'],
  },

  // ── Automation ───────────────────────────────────────────────────────────
  {
    id: 'cron',
    label: 'cron',
    description: 'Schedule a background job',
    sectionId: 'automation',
    profiles: ['coding'],
  },
  {
    id: 'workflow',
    label: 'workflow',
    description: 'Define a multi-step workflow',
    sectionId: 'automation',
    profiles: ['coding'],
  },
];

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

/** Build ordered AgentToolSection[] from a flat list of AgentToolRecord-like objects.
 *  Unknown section IDs are collected into a trailing "registered" section.
 */
export function groupToolsBySection<T extends { id: string }>(
  tools: T[],
  getSectionId: (tool: T) => string,
): Array<{ id: string; label: string; tools: T[] }> {
  const definitionMap = new Map(CORE_TOOL_DEFINITIONS.map((d) => [d.id, d]));
  const sectionMap = new Map(CORE_TOOL_SECTION_ORDER.map((s) => [s.id, { ...s, tools: [] as T[] }]));
  const registered: T[] = [];

  for (const tool of tools) {
    const def = definitionMap.get(tool.id);
    const sectionId = def?.sectionId ?? getSectionId(tool);
    const section = sectionMap.get(sectionId);
    if (section) {
      section.tools.push(tool);
    } else {
      registered.push(tool);
    }
  }

  const result = Array.from(sectionMap.values()).filter((s) => s.tools.length > 0);
  if (registered.length > 0) {
    result.push({ id: 'registered', label: 'Registered', tools: registered });
  }
  return result;
}

/** Return the default enabled tool IDs for a given profile. */
export function toolsForProfile(profile: ToolProfile): string[] {
  return CORE_TOOL_DEFINITIONS.filter((d) => d.profiles.includes(profile)).map((d) => d.id);
}
