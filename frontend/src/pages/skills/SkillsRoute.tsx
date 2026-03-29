/**
 * SkillsRoute — entry point for /skills.
 * The SkillsPage now handles its own data fetching and layout,
 * including the graph view and slide-in skill detail panel.
 */
import { SkillsPage } from './SkillsPage';

export function SkillsRoute() {
  return <SkillsPage />;
}
