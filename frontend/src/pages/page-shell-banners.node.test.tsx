import { describe, expect, it } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { renderToStaticMarkup } from 'react-dom/server';

import { OperationsPage } from './operations/OperationsPage';
import { DiagnosticsPage } from './diagnostics/DiagnosticsPage';
import { SkillsPage } from './skills/SkillsPage';
import { BuilderPage } from './builder/BuilderPage';
import { SystemPage } from './system/SystemPage';

function renderOperationsPage() {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={['/operations/summary']}>
      <Routes>
        <Route path="/operations" element={<OperationsPage />}>
          <Route path="summary" element={<div>Summary body</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

function renderDiagnosticsPage() {
  return renderToStaticMarkup(
    <MemoryRouter>
      <DiagnosticsPage />
    </MemoryRouter>,
  );
}

function renderSkillsPage() {
  return renderToStaticMarkup(
    <MemoryRouter>
      <SkillsPage />
    </MemoryRouter>,
  );
}

function renderBuilderPage() {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={['/builder/workflows']}>
      <Routes>
        <Route path="/builder" element={<BuilderPage />}>
          <Route path="workflows" element={<div>Workflow body</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

function renderSystemPage() {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={['/logs']}>
      <Routes>
        <Route path="/logs" element={<SystemPage />}>
          <Route index element={<div>Logs body</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('page shells', () => {
  it('does not render the operations hero banner copy', () => {
    const html = renderOperationsPage();
    expect(html).not.toContain('Daily ops');
    expect(html).not.toContain('daily operator surface');
  });

  it('does not render the diagnostics hero banner copy', () => {
    const html = renderDiagnosticsPage();
    expect(html).not.toContain('Doctor report');
    expect(html).not.toContain('UI-first recovery surface');
  });

  it('does not render the skills hero banner copy', () => {
    const html = renderSkillsPage();
    expect(html).not.toContain('Workspace skills are now managed from the web control UI');
  });

  it('does not render the builder side rail copy', () => {
    const html = renderBuilderPage();
    expect(html).not.toContain('Agents, workflows, skills, and coding tools for building and managing your AI system.');
    expect(html).not.toContain('Agent Board');
  });

  it('does not render the system side rail copy', () => {
    const html = renderSystemPage();
    expect(html).not.toContain('Logs and cron surfaces for low-frequency system management.');
  });
});
