import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setupMocks, createTestClient } from './testHelper';
import {
  TestRailAPIError,
  TestRailNetworkError,
  TestRailTimeoutError,
} from '../../../src/client/api/baseClient';
import { handleApiError } from '../../../src/client/api/utils';

// Shape of an axios error as thrown by the (mocked) axios instance
function axiosError(status: number, data: unknown) {
  return { isAxiosError: true, message: `Request failed with status code ${status}`, response: { status, data } };
}

describe('TestRail error handling', () => {
  let mockAxiosInstance: ReturnType<typeof setupMocks>;
  let client: ReturnType<typeof createTestClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAxiosInstance = setupMocks();
    client = createTestClient();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('surfaces TestRail error text and status for a 403 on a write', async () => {
    mockAxiosInstance.post.mockRejectedValue(
      axiosError(403, { error: 'You are not allowed to add sections (insufficient permissions).' }),
    );

    const error = await client.sections
      .addSection(10, { name: 'x', suite_id: 1 })
      .catch((e) => e);

    expect(error).toBeInstanceOf(TestRailAPIError);
    expect(error.status).toBe(403);
    expect(error.message).toBe(
      'Failed to add section to project 10: Permission denied (403): You are not allowed to add sections (insufficient permissions).',
    );
  });

  it('surfaces TestRail validation text for a 400', async () => {
    mockAxiosInstance.get.mockRejectedValue(
      axiosError(400, { error: 'Field :case_id is not a valid test case.' }),
    );

    await expect(client.cases.getCase(999)).rejects.toThrow(
      'Failed to get test case 999: Bad Request (400): Field :case_id is not a valid test case.',
    );
  });

  it('includes the status when TestRail returns no error text', async () => {
    mockAxiosInstance.get.mockRejectedValue(axiosError(401, ''));

    await expect(client.projects.getProjects()).rejects.toThrow(
      'Failed to get projects: Authentication failed (401)',
    );
  });

  it('maps 5xx responses to a server error', async () => {
    mockAxiosInstance.get.mockRejectedValue(axiosError(503, { error: 'Maintenance' }));

    await expect(client.runs.getRun(1)).rejects.toThrow('TestRail server error (503): Maintenance');
  });

  it('maps a timeout to TestRailTimeoutError', () => {
    const error = handleApiError(
      { isAxiosError: true, code: 'ECONNABORTED', message: 'timeout of 30000ms exceeded' },
      'Failed to get run',
    );

    expect(error).toBeInstanceOf(TestRailTimeoutError);
    expect(error.message).toBe('Failed to get run: Request timed out');
  });

  it('maps a request with no response to TestRailNetworkError', () => {
    const error = handleApiError(
      { isAxiosError: true, message: 'getaddrinfo ENOTFOUND example.invalid' },
      'Failed to get projects',
    );

    expect(error).toBeInstanceOf(TestRailNetworkError);
    expect(error.message).toBe(
      'Failed to get projects: Network error occurred: getaddrinfo ENOTFOUND example.invalid',
    );
  });

  it('passes non-HTTP errors through unchanged', () => {
    const original = new Error('validation failed');

    expect(handleApiError(original, 'Failed to add test case')).toBe(original);
  });
});
