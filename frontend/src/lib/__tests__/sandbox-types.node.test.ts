import { describe, it, expectTypeOf } from 'vitest';
import type {
  SandboxInboundFilter,
  SandboxMcpPolicy,
  SandboxPolicy,
  AuditEntry,
  McpServerStatus,
} from '../types';

describe('Extended sandbox types', () => {
  it('SandboxInboundFilter has required fields', () => {
    expectTypeOf<SandboxInboundFilter>().toHaveProperty('max_size_kb');
    expectTypeOf<SandboxInboundFilter>().toHaveProperty('strip_patterns');
    expectTypeOf<SandboxInboundFilter>().toHaveProperty('block_on_match');
  });

  it('SandboxMcpPolicy has default, servers, inbound', () => {
    expectTypeOf<SandboxMcpPolicy>().toHaveProperty('default');
    expectTypeOf<SandboxMcpPolicy>().toHaveProperty('servers');
    expectTypeOf<SandboxMcpPolicy>().toHaveProperty('inbound');
  });

  it('SandboxPolicy.sandbox has optional mcp field', () => {
    expectTypeOf<SandboxPolicy['sandbox']>().toHaveProperty('mcp');
  });

  it('AuditEntry has direction, server, tool, filtered fields', () => {
    expectTypeOf<AuditEntry>().toHaveProperty('direction');
    expectTypeOf<AuditEntry>().toHaveProperty('server');
    expectTypeOf<AuditEntry>().toHaveProperty('tool');
    expectTypeOf<AuditEntry>().toHaveProperty('filtered');
  });

  it('McpServerStatus has name, connected, tool_count', () => {
    expectTypeOf<McpServerStatus>().toHaveProperty('name');
    expectTypeOf<McpServerStatus>().toHaveProperty('connected');
    expectTypeOf<McpServerStatus>().toHaveProperty('tool_count');
  });
});
