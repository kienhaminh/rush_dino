export interface SkillRecord {
  name: string;
  description: string;
  instructions: string;
  path: string;
  tools: string[];
  /** Bundled / system skills — not editable or deletable via the dashboard. */
  isBuiltIn: boolean;
}
