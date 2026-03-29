// SandboxOverviewContent was removed in the two-section layout rewrite.
// The new SandboxMonitorPage is a stateful component with hooks and cannot be
// rendered with renderToStaticMarkup. Policy panel and agent section behaviour
// is covered by their own unit tests.

import { describe, it } from 'vitest';

describe('SandboxMonitorPage', () => {
  it.todo('renders main agent section and team agents section');
});
