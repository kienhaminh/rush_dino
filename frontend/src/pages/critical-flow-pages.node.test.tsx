import { describe, expect, it } from 'vitest';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { renderToStaticMarkup } from 'react-dom/server';

import { KanbanPage } from './kanban/KanbanPage';
import { BuilderPage } from './builder/BuilderPage';
import { ChannelsPage } from './channels/ChannelsPage';
import { CronPage } from './cron/CronPage';
import { SkillsPage } from './skills/SkillsPage';
import { SystemPage } from './system/SystemPage';

describe('critical flow page coverage', () => {
  it('renders channel, cron, and skills feature surfaces', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/builder/agents']}>
        <Routes>
          <Route path="/builder" element={<BuilderPage />}>
            <Route path="agents" element={<div>Builder body</div>} />
          </Route>
          <Route path="/system" element={<SystemPage />}>
            <Route path="logs" element={<div>System body</div>} />
          </Route>
          <Route path="*" element={<Outlet />} />
        </Routes>

        <ChannelsPage
          connected
          loading={false}
          snapshot={{
            channels: {
              telegram: { connected: true, running: true },
              slack: { connected: false, running: false },
            },
            channelAccounts: {
              telegram: [{ id: 'acct-1', label: 'Ops Bot' }],
            },
          }}
          lastError={null}
          lastSuccessAt={Date.UTC(2026, 2, 16, 0, 0, 0)}
          appConfig={null}
          credentials={null}
          channelConfigSaving={false}
          channelUiSettings={{}}
          nostrProfileFormState={null}
          nostrProfileAccountId={null}
          onRefresh={() => undefined}
          onChannelToggle={() => undefined}
          onChannelConfigAction={() => undefined}
          onOpenChannelConfig={() => undefined}
          onNostrProfileEdit={() => undefined}
          onNostrProfileFieldChange={() => undefined}
          onNostrProfileSave={() => undefined}
          onNostrProfileImport={() => undefined}
          onNostrProfileCancel={() => undefined}
          onNostrProfileToggleAdvanced={() => undefined}
        />

        <SkillsPage
          skills={[
            {
              name: 'smoke-skill',
              description: 'Smoke coverage skill',
              instructions: 'Do the smoke-test task.',
              path: '/tmp/smoke-skill.toml',
              tools: ['shell_exec', 'file_read'],
            },
          ]}
          loading={false}
          error={null}
          filter=""
          onFilterChange={() => undefined}
          draft={{
            name: '',
            description: '',
            instructions: '',
            tools: '',
          }}
          saving={false}
          onDraftChange={() => undefined}
          onSave={() => undefined}
          onResetDraft={() => undefined}
          onEdit={() => undefined}
          onRefresh={() => undefined}
          onDelete={() => undefined}
        />

        <CronPage />
        <KanbanPage />
      </MemoryRouter>,
    );

    expect(html).toContain('Last success');
    expect(html).toContain('Telegram');
    expect(html).toContain('smoke-skill');
    expect(html).toContain('Active Jobs');
    expect(html).toContain('Task Board');
  });

  it('renders builder and system navigation shells', () => {
    const builderHtml = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/builder/agents']}>
        <Routes>
          <Route path="/builder" element={<BuilderPage />}>
            <Route path="agents" element={<div>Builder body</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    const systemHtml = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/logs']}>
        <Routes>
          <Route path="/logs" element={<SystemPage />}>
            <Route index element={<div>System body</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(builderHtml).toContain('Builder');
    expect(builderHtml).toContain('Agents');
    expect(systemHtml).toContain('System');
    expect(systemHtml).toContain('Logs');
  });
});
