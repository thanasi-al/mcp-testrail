import { describe, it, expect, vi } from 'vitest';
import { describeToolCall, describeToolCallFields, LookupClient, withDisplayKeys } from '../../src/approval/describe';

// Pure Access > API Automation > Access Engine > Commissioning > YP Sync
const sections: Record<number, { id: number; name: string; suite_id: number; parent_id: number | null }> = {
  10: { id: 10, name: 'Access Engine', suite_id: 47, parent_id: null },
  11: { id: 11, name: 'Commissioning', suite_id: 47, parent_id: 10 },
  12: { id: 12, name: 'YP Sync', suite_id: 47, parent_id: 11 },
};
const cases: Record<number, { id: number; title: string; section_id: number; suite_id: number; refs: string | null }> = {
  101: { id: 101, title: 'Sync Pushes Credentials', section_id: 12, suite_id: 47, refs: 'ZEN-101' },
  102: { id: 102, title: 'Sync Retries On 5xx', section_id: 12, suite_id: 47, refs: null },
  103: { id: 103, title: 'Sync Skips Offline Locks', section_id: 12, suite_id: 47, refs: null },
  104: { id: 104, title: 'Sync Reports Errors', section_id: 12, suite_id: 47, refs: null },
};

function fakeClient(overrides: Partial<Record<keyof LookupClient, unknown>> = {}): LookupClient {
  const notFound = (kind: string, id: number) => Promise.reject(new Error(`${kind} ${id} not found`));
  return {
    projects: { getProject: vi.fn(async (id: number) => (id === 1 ? { id, name: 'Pure Access' } : notFound('project', id))) },
    suites: { getSuite: vi.fn(async (id: number) => (id === 47 ? { id, name: 'API Automation', project_id: 1 } : notFound('suite', id))) },
    sections: { getSection: vi.fn(async (id: number) => sections[id] ?? notFound('section', id)) },
    cases: { getCase: vi.fn(async (id: number) => cases[id] ?? notFound('case', id)) },
    runs: { getRun: vi.fn(async (id: number) => (id === 5 ? { id, name: 'Nightly API', suite_id: 47, project_id: 1 } : notFound('run', id))) },
    ...overrides,
  } as unknown as LookupClient;
}

describe('describeToolCall', () => {
  it('names the project, suite and full section path for addCase', async () => {
    const text = await describeToolCall(fakeClient(), 'mcp__testrail__addCase', {
      sectionId: 12,
      title: 'Sync Pushes Credentials',
      refs: 'ZEN-9734',
    });

    expect(text).toBe(
      [
        'TestRail addCase',
        'Project:  Pure Access (#1)',
        'Suite:    API Automation (#47)',
        'Section:  Access Engine › Commissioning › YP Sync (#12)',
        'Title:    "Sync Pushes Credentials"',
        'Refs:     ZEN-9734',
        'Names are looked up from TestRail by ID; title, name and refs are as requested.',
      ].join('\n'),
    );
  });

  it('marks a top-level section', async () => {
    const text = await describeToolCall(fakeClient(), 'addCase', { sectionId: 10, title: 'X' });

    expect(text).toContain('Section:  Access Engine [top level] (#10)');
  });

  it('shows root placement when addSection or moveSection has no parent', async () => {
    const added = await describeToolCall(fakeClient(), 'addSection', { projectId: 1, suiteId: 47, name: 'New' });
    const moved = await describeToolCall(fakeClient(), 'moveSection', { sectionId: 12, parentId: null });
    const nested = await describeToolCall(fakeClient(), 'addSection', { projectId: 1, suiteId: 47, parentId: 11, name: 'New' });

    expect(added).toContain('Parent:   (root of suite)');
    expect(moved.indexOf('Section:  Access Engine › Commissioning › YP Sync (#12)')).toBeLessThan(
      moved.indexOf('Parent:   (root of suite)'),
    );
    expect(nested).toContain('Parent:   Access Engine › Commissioning (#11)');
  });

  it('derives project and suite from the section when the input has neither', async () => {
    const text = await describeToolCall(fakeClient(), 'addCase', { sectionId: 12 });

    expect(text).toContain('Project:  Pure Access (#1)');
    expect(text).toContain('Suite:    API Automation (#47)');
  });

  it('shows the refs being replaced on updateCase', async () => {
    const text = await describeToolCall(fakeClient(), 'updateCase', { caseId: 101, refs: 'ZEN-9734' });

    expect(text).toContain('Case:     Sync Pushes Credentials (C101) in Access Engine › Commissioning › YP Sync');
    expect(text).toContain('Refs:     ZEN-9734  (replaces current: ZEN-101)');
  });

  it('names up to three cases and counts the rest', async () => {
    const text = await describeToolCall(fakeClient(), 'moveToSection', { caseIds: [101, 102, 103, 104], sectionId: 12 });

    expect(text).toContain(
      'Cases:    4 case(s): Sync Pushes Credentials (C101); Sync Retries On 5xx (C102); Sync Skips Offline Locks (C103); +1 more',
    );
  });

  it('warns that a hard deleteSection removes its cases', async () => {
    const hard = await describeToolCall(fakeClient(), 'deleteSection', { sectionId: 12 });
    const soft = await describeToolCall(fakeClient(), 'deleteSection', { sectionId: 12, soft: true });

    expect(hard).toContain('Warning:  deletes the section, its subsections and every case in them');
    expect(soft).not.toContain('Warning:');
  });

  it('resolves a run to its name, suite and project', async () => {
    const text = await describeToolCall(fakeClient(), 'addResultForCase', { runId: 5, caseId: 102 });

    expect(text).toContain('Project:  Pure Access (#1)');
    expect(text).toContain('Run:      Nightly API (R5)');
  });

  it('reports lookup failures inline instead of throwing', async () => {
    const text = await describeToolCall(fakeClient(), 'addCase', { sectionId: 999, title: 'X' });

    expect(text).toContain('Section:  (lookup failed: section 999 not found)');
    expect(text).toContain('Title:    "X"');
  });
});

describe('withDisplayKeys', () => {
  it('adds looked-up names as leading "@" keys and keeps every original argument', async () => {
    const input = { sectionId: 12, title: 'Sync Pushes Credentials', refs: 'ZEN-9734' };
    const { fields } = await describeToolCallFields(fakeClient(), 'addCase', input);

    const updated = withDisplayKeys(input, fields);

    expect(updated).toEqual({
      '@project': 'Pure Access (#1)',
      '@suite': 'API Automation (#47)',
      '@section': 'Access Engine › Commissioning › YP Sync (#12)',
      sectionId: 12,
      title: 'Sync Pushes Credentials',
      refs: 'ZEN-9734',
    });
    expect(Object.keys(updated).slice(0, 3)).toEqual(['@project', '@suite', '@section']);
  });

  it('keeps refs replacement notes, which add information beyond the argument', async () => {
    const input = { caseId: 101, refs: 'ZEN-9734' };
    const { fields } = await describeToolCallFields(fakeClient(), 'updateCase', input);

    expect(withDisplayKeys(input, fields)['@refs']).toBe('ZEN-9734  (replaces current: ZEN-101)');
  });

  it('drops display keys supplied by the caller', () => {
    const updated = withDisplayKeys(
      { sectionId: 12, '@section': 'Something Harmless', '@project': 'Fake' },
      [{ label: 'Lookup', value: 'failed: boom' }],
    );

    expect(updated).toEqual({ '@lookup': 'failed: boom', sectionId: 12 });
  });
});
