import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  getActiveContainers,
  getRecentRuns,
  getRecentErrors,
  killContainer,
  trackContainerStart,
  trackContainerEnd,
  trackContainerError,
  resetTracking,
} from '../container-runner.js';

describe('Container Tracking', () => {
  beforeEach(() => {
    resetTracking();
  });

  describe('activeContainers', () => {
    it('tracks a started container', () => {
      trackContainerStart('test-group', {
        pid: 1234,
        groupName: 'Test Group',
        promptPreview: 'Hello world',
      });

      const active = getActiveContainers();
      expect(active).toHaveLength(1);
      expect(active[0]).toMatchObject({
        groupFolder: 'test-group',
        groupName: 'Test Group',
        pid: 1234,
        promptPreview: 'Hello world',
      });
      expect(active[0].elapsedMs).toBeGreaterThanOrEqual(0);
      expect(active[0].startedAt).toBeTruthy();
    });

    it('removes container on end', () => {
      trackContainerStart('test-group', {
        pid: 1234,
        groupName: 'Test Group',
        promptPreview: 'Hello',
      });
      trackContainerEnd('test-group', { durationMs: 5000, status: 'success' });

      expect(getActiveContainers()).toHaveLength(0);
    });

    it('removes container on error', () => {
      trackContainerStart('test-group', {
        pid: 1234,
        groupName: 'Test Group',
        promptPreview: 'Hello',
      });
      trackContainerError('test-group', {
        durationMs: 3000,
        error: 'Container crashed',
        type: 'exit_code',
      });

      expect(getActiveContainers()).toHaveLength(0);
    });

    it('tracks multiple containers simultaneously', () => {
      trackContainerStart('group-a', { pid: 100, groupName: 'Group A', promptPreview: 'A' });
      trackContainerStart('group-b', { pid: 200, groupName: 'Group B', promptPreview: 'B' });

      expect(getActiveContainers()).toHaveLength(2);

      trackContainerEnd('group-a', { durationMs: 1000, status: 'success' });
      expect(getActiveContainers()).toHaveLength(1);
      expect(getActiveContainers()[0].groupFolder).toBe('group-b');
    });
  });

  describe('recentRuns ring buffer', () => {
    it('records successful runs', () => {
      trackContainerStart('test-group', { pid: 1, groupName: 'Test', promptPreview: 'x' });
      trackContainerEnd('test-group', { durationMs: 5000, status: 'success' });

      const runs = getRecentRuns();
      expect(runs).toHaveLength(1);
      expect(runs[0]).toMatchObject({
        groupFolder: 'test-group',
        groupName: 'Test',
        status: 'success',
        durationMs: 5000,
      });
      expect(runs[0].startedAt).toBeTruthy();
    });

    it('records error runs with summary', () => {
      trackContainerStart('test-group', { pid: 1, groupName: 'Test', promptPreview: 'x' });
      trackContainerError('test-group', {
        durationMs: 3000,
        error: 'Container exited with code 1: something went wrong',
        type: 'exit_code',
      });

      const runs = getRecentRuns();
      expect(runs).toHaveLength(1);
      expect(runs[0].status).toBe('error');
      expect(runs[0].errorSummary).toBe('Container exited with code 1: something went wrong');
    });

    it('caps at 20 entries', () => {
      for (let i = 0; i < 25; i++) {
        trackContainerStart(`group-${i}`, { pid: i, groupName: `Group ${i}`, promptPreview: 'x' });
        trackContainerEnd(`group-${i}`, { durationMs: 100, status: 'success' });
      }

      const runs = getRecentRuns();
      expect(runs).toHaveLength(20);
      // Should keep the most recent 20 (groups 5-24)
      expect(runs[0].groupFolder).toBe('group-5');
      expect(runs[19].groupFolder).toBe('group-24');
    });
  });

  describe('recentErrors ring buffer', () => {
    it('records container errors', () => {
      trackContainerStart('test-group', { pid: 1, groupName: 'Test', promptPreview: 'x' });
      trackContainerError('test-group', {
        durationMs: 3000,
        error: 'Container crashed badly',
        type: 'exit_code',
      });

      const errors = getRecentErrors();
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatchObject({
        groupFolder: 'test-group',
        error: 'Container crashed badly',
        type: 'exit_code',
      });
      expect(errors[0].timestamp).toBeTruthy();
    });

    it('does not record successful runs as errors', () => {
      trackContainerStart('test-group', { pid: 1, groupName: 'Test', promptPreview: 'x' });
      trackContainerEnd('test-group', { durationMs: 5000, status: 'success' });

      expect(getRecentErrors()).toHaveLength(0);
    });

    it('caps at 10 entries', () => {
      for (let i = 0; i < 15; i++) {
        trackContainerStart(`group-${i}`, { pid: i, groupName: `Group ${i}`, promptPreview: 'x' });
        trackContainerError(`group-${i}`, {
          durationMs: 100,
          error: `Error ${i}`,
          type: 'exit_code',
        });
      }

      const errors = getRecentErrors();
      expect(errors).toHaveLength(10);
      expect(errors[0].error).toBe('Error 5');
      expect(errors[9].error).toBe('Error 14');
    });
  });

  describe('killContainer', () => {
    it('returns false for unknown group', () => {
      expect(killContainer('nonexistent')).toBe(false);
    });

    it('kills a tracked container and removes it', () => {
      // Mock process.kill
      const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);

      trackContainerStart('stuck-group', { pid: 9999, groupName: 'Stuck', promptPreview: 'x' });
      expect(killContainer('stuck-group')).toBe(true);
      expect(killSpy).toHaveBeenCalledWith(9999, 'SIGKILL');
      expect(getActiveContainers()).toHaveLength(0);

      killSpy.mockRestore();
    });

    it('returns false when process.kill throws', () => {
      const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => {
        throw new Error('No such process');
      });

      trackContainerStart('dead-group', { pid: 9999, groupName: 'Dead', promptPreview: 'x' });
      expect(killContainer('dead-group')).toBe(false);

      killSpy.mockRestore();
    });
  });

  describe('truncation', () => {
    it('truncates promptPreview to 100 chars', () => {
      const longPrompt = 'x'.repeat(200);
      trackContainerStart('test-group', { pid: 1, groupName: 'Test', promptPreview: longPrompt });

      const active = getActiveContainers();
      expect(active[0].promptPreview.length).toBeLessThanOrEqual(100);
    });

    it('truncates errorSummary to 200 chars', () => {
      const longError = 'e'.repeat(300);
      trackContainerStart('test-group', { pid: 1, groupName: 'Test', promptPreview: 'x' });
      trackContainerError('test-group', {
        durationMs: 100,
        error: longError,
        type: 'exit_code',
      });

      const runs = getRecentRuns();
      expect(runs[0].errorSummary!.length).toBeLessThanOrEqual(200);

      const errors = getRecentErrors();
      expect(errors[0].error.length).toBeLessThanOrEqual(200);
    });
  });
});
