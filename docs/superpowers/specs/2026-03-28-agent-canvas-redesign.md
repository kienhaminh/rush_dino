# Agent Canvas & Skill Pool Redesign

**Date:** 2026-03-28
**Status:** Approved

## Context

The current agents page shows all agents as cards in a board canvas with a slide-in detail panel. There is no way to manage which skills and tools are assigned to an agent directly from the UI. The skills page exists as a radial graph but has no management capability. This redesign makes the **agent** the primary subject — one focused agent at a time — with a visual orbital canvas showing all connected skills and tools, and direct assignment management from the UI.

---

## Decisions Summary

| Question | Decision |
|----------|----------|
| How many agents shown at once? | One at a time — focused view |
| Navigation between agents | Tab bar at top of focused page |
| Entry point | Overview board first, click agent to enter focused view |
| Focused canvas layout | Orbital/satellite — agent in center, skills & tools orbit with glow edges |
| Pool surfacing | Floating palette triggered by `+` button |
| Palette tabs | Skills tab + Tools tab — separated |
| Skills page | Rebuilt as dedicated Skill Pool management page |
| Architecture | URL-routed pages |

---

## Page Structure & Routing

```
/agents          → Overview board (all agents as cards) — exists, minor changes
/agents/:id      → Focused orbital canvas for one agent — NEW
/skills          → Skill Pool management page — REBUILT
```

### `/agents` — Overview Board (minor changes)
- Each agent card gains a click handler → navigates to `/agents/:id`
- Remove the slide-in detail panel (replaced by focused page)
- Cards show summary only: emoji, name, skill count, tool count
- Everything else unchanged (canvas, minimap, toolbar, animations)

---

## `/agents/:id` — Focused Agent Page

### Layout
```
┌─────────────────────────────────────────────────────────┐
│ ← All agents │ 🤖 Engineer │ 🎨 Designer │ 🧪 Tester… │ [3 skills · 2 tools] [GPT-4o] [Edit] │
├─────────────────────────────────────────────────────────┤
│                                                         │
│           (orbital ReactFlow canvas)                    │
│                                                         │
│     [commit]──────●🤖 ENGINEER●──────[review]          │
│                  / | \                                  │
│           [test]   |   [web 🌐]                        │
│                    |                                    │
│              [pr-summarizer auto]                       │
│                                                    [+]  │
└─────────────────────────────────────────────────────────┘
```

### Tab Bar
- All agents listed as tabs — clicking navigates to `/agents/:id`
- Active agent highlighted with indigo accent
- `← All agents` back link on the far left navigates to `/agents`
- Agent metadata inline on the right: skill count, tool count, model badge, Edit button
- No separate info bar — keeps canvas space maximized

### Orbital Canvas
- Agent node in center (circle, indigo glow)
- Assigned skills and tools as satellite nodes orbiting around it
- Glow edges connecting center to satellites (existing `agent-glow-edge.tsx`)
- `+` button fixed bottom-right to open pool palette

### Node Visual Language

| Type | Border | Edge | Badge | Removable |
|------|--------|------|-------|-----------|
| Core skill | Solid indigo | Solid glow | — | ✕ button |
| Custom skill | Dashed indigo | Solid glow | `auto` | ✕ button |
| Core tool | Solid cyan | Solid glow | — | ✕ button |
| Custom tool (MCP) | Dashed cyan | Dashed dim | `auto` | No — agent-managed |

- **Core skills/tools** — manually assigned by user, removable with ✕
- **Custom skills** — agent-created, can be manually assigned/removed
- **Custom tools (MCP/user-installed)** — agent-discovered via Tool Search protocol, shown read-only, no ✕

### Pool Palette (+ button)
- Floating panel anchored bottom-right
- Header: "Add to [Agent Name]" + ✕ to close
- **Skills tab** (indigo accent):
  - Search bar calls `querySkillGraph(q)` — semantic graph-based results
  - CORE section: list of unassigned core skills with `+ add` button
  - CUSTOM section: agent-created skills with `+ add` button
  - Already-assigned skills shown dimmed with "assigned" label
- **Tools tab** (cyan accent):
  - Search bar scoped to tools
  - CORE section: list of core tools with `+ add` button
  - Already-assigned tools shown dimmed with "assigned" label
  - Custom tools (MCP) not shown — agent-discovered automatically
- Canvas dims behind palette; click outside to close
- `+ add` assigns immediately, new node animates into orbital canvas

---

## `/skills` — Skill Knowledge Graph Page

Skills are organized as a **knowledge graph** — nodes and edges — to support semantic querying. The page visualizes this graph and lets you explore skill relationships, see agent usage, and assign skills to agents.

### Layout
```
┌──────────────────────────────────────────────────────┐
│ Skill Pool  [🔍 search…]           [All|Core|Custom] │
├─────────────────────────────────┬────────────────────┤
│                                 │  (slide-in panel)  │
│   ReactFlow knowledge graph     │  📦 commit         │
│                                 │  ──────────────    │
│   [category]──[skill]──[skill]  │  Git commit helper │
│        \──[skill]──[category]   │                    │
│                                 │  Used by:          │
│   Click a skill node to open →  │  🤖 Engineer  ✕   │
│   the detail panel              │  🎨 Designer  ✕   │
│                                 │                    │
│                                 │  Assign to:        │
│                                 │  [+ Engineer    ▾] │
└─────────────────────────────────┴────────────────────┘
```

### Graph Visualization
- Built on existing `SkillGraphView.tsx` (ReactFlow, radial layout)
- Node types: `category` (larger, label only) and `skill` (emoji + name)
- Edge types: `belongs_to` (skill → category), `related_to` (skill ↔ skill, weighted)
- Core skills: solid node border. Custom skills: dashed border + `auto` badge
- Clicking a skill node opens the detail panel (slide-in from right)
- Search uses `querySkillGraph(q)` — semantic graph query, not plain text filter

### Skill Detail Panel (slide-in on node click)
- Skill name, emoji, description
- **Used by** section: agent chips with ✕ to remove assignment, clickable → `/agents/:id`
- **Assign to** dropdown: lists agents that don't yet have this skill — selecting one assigns it
- Custom skills show "Created by [Agent]"
- Closing panel deselects the node

### Filters
- Search bar: calls `/api/skill-graph/query?q=...` — surfaces semantically related skills
- All / Core / Custom tab filter
- Highlighted nodes respond to active filter

---

## Files

### New Files
| File | Purpose |
|------|---------|
| `frontend/src/pages/agents/AgentFocusPage.tsx` | `/agents/:id` route — hosts tab bar + orbital canvas |
| `frontend/src/pages/agents/agent-orbital-canvas.tsx` | Refactored orbital canvas with pool palette integration |
| `frontend/src/pages/agents/agent-pool-palette.tsx` | Floating `+` palette with Skills/Tools tabs |
| `frontend/src/pages/skills/SkillPoolPage.tsx` | Rebuilt `/skills` pool management page |

### Existing Files to Reuse
| File | Change |
|------|--------|
| `agent-board-canvas.tsx` | Add `onClick` to agent nodes → navigate to `/agents/:id` |
| `agent-network-flow.tsx` | Base for `agent-orbital-canvas.tsx` — extend with pool palette wiring |
| `agent-glow-edge.tsx` | Reused unchanged |
| `agent-core-node.tsx` | Reused unchanged |
| `AgentsPage.tsx` | Remove detail panel, simplify to overview only |
| `skills/SkillGraphView.tsx` node components | Skill node styles reused in pool page cards |

### Route Registration
Add `/agents/:id` route in the app router pointing to `AgentFocusPage`.

---

## Core vs Custom — Data Model Notes

- **Core skills** — sourced from existing `AgentSkillRecord` where `group: 'built-in' | 'workspace' | 'bundled'`
- **Custom skills** — `group: 'custom'` or new field `source: 'agent-created'` with `createdBy: agentId`
- **Core tools** — existing `AgentToolSection` items
- **Custom tools (MCP)** — sourced from runtime data, flagged as `discovered: true`, no assignment API call needed

---

## Verification

1. Navigate to `/agents` — overview board loads, click an agent card → routes to `/agents/:id`
2. On `/agents/:id` — orbital canvas renders with agent in center, assigned skills/tools as nodes
3. Tab bar shows all agents, clicking a tab switches the focused agent and updates URL
4. `← All agents` navigates back to `/agents`
5. Click `+` — palette opens with Skills/Tools tabs; search filters work
6. Click `+ add` on a skill — new node animates into canvas, palette item becomes "assigned"
7. Click ✕ on a canvas node — removes assignment, node disappears
8. Custom tool nodes have no ✕ and are not shown in palette
9. Navigate to `/skills` — skill pool page loads with core/custom sections, category sidebar filters work
10. Click an agent chip on a skill card → routes to `/agents/:id`
