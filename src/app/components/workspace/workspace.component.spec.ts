import '@angular/compiler';
import { WorkspaceComponent } from './workspace.component';
import { Activity } from '../../models/jules.models';
import { describe, it, expect, vi } from 'vitest';

// Mock Angular's inject and signal
vi.mock('@angular/core', async () => {
  const actual = await vi.importActual('@angular/core');
  return {
    ...actual,
    inject: vi.fn(() => ({})),
    signal: vi.fn((initialValue) => {
      let value = initialValue;
      const s = vi.fn(() => value);
      (s as any).set = vi.fn((newValue) => { value = newValue; });
      (s as any).update = vi.fn((updateFn) => { value = updateFn(value); });
      return s;
    }),
    effect: vi.fn()
  };
});

vi.mock('@angular/router', () => ({
  ActivatedRoute: vi.fn(),
  Router: vi.fn(),
  RouterModule: {
    forRoot: vi.fn()
  }
}));

describe('WorkspaceComponent (unit tests)', () => {
  const component = new WorkspaceComponent();

  describe('parseDiff', () => {
    it('should parse a single file diff', () => {
      const patch = 'diff --git a/src/app.ts b/src/app.ts\nindex 123..456 100644\n--- a/src/app.ts\n+++ b/src/app.ts\n@@ -1,1 +1,1 @@\n-old line\n+new line\n context line';
      const result = component.parseDiff(patch);
      expect(result).toHaveLength(1);
      expect(result[0].fileName).toBe('src/app.ts');
      expect(result[0].lines).toEqual([
        { text: 'old line', type: 'deletion' },
        { text: 'new line', type: 'addition' },
        { text: ' context line', type: 'context' }
      ]);
    });

    it('should parse multiple file diffs', () => {
      const patch = 'diff --git a/file1.ts b/file1.ts\n+added\ndiff --git a/file2.ts b/file2.ts\n-removed';
      const result = component.parseDiff(patch);
      expect(result).toHaveLength(2);
      expect(result[0].fileName).toBe('file1.ts');
      expect(result[1].fileName).toBe('file2.ts');
    });

    it('should handle missing filenames gracefully', () => {
      const patch = 'diff --git random garbage\n+line';
      const result = component.parseDiff(patch);
      expect(result[0].fileName).toBe('unknown file');
    });
  });

  describe('chat sending state', () => {
    it('should initialize isSendingMessage as false', () => {
      expect(component.isSendingMessage()).toBe(false);
    });
  });

  describe('getActivityMessage', () => {
    it('should return user message', () => {
      const activity = { userMessaged: { userMessage: 'Hello Jules' } } as Activity;
      expect(component.getActivityMessage(activity)).toBe('Hello Jules');
    });

    it('should return agent message', () => {
      const activity = { agentMessaged: { agentMessage: 'Hello User' } } as Activity;
      expect(component.getActivityMessage(activity)).toBe('Hello User');
    });

    it('should return plan generated message with description', () => {
      const activity = { planGenerated: {}, description: 'Detailed plan' } as Activity;
      expect(component.getActivityMessage(activity)).toBe('Detailed plan');
    });

    it('should return default plan generated message', () => {
      const activity = { planGenerated: {} } as Activity;
      expect(component.getActivityMessage(activity)).toBe('Generated a new plan.');
    });

    it('should return plan approved message with description', () => {
      const activity = { planApproved: {}, description: 'Approved by me' } as Activity;
      expect(component.getActivityMessage(activity)).toBe('Approved by me');
    });

    it('should return default plan approved message', () => {
      const activity = { planApproved: {} } as Activity;
      expect(component.getActivityMessage(activity)).toBe('Plan approved.');
    });

    it('should format progressUpdated with title and description', () => {
      const activity = {
        progressUpdated: { title: 'Working', description: 'Testing' }
      } as Activity;
      expect(component.getActivityMessage(activity)).toBe('Working: Testing');
    });

    it('should format progressUpdated with title only', () => {
      const activity = {
        progressUpdated: { title: 'Working', description: '' }
      } as Activity;
      expect(component.getActivityMessage(activity)).toBe('Working');
    });

    it('should format progressUpdated with description only', () => {
      const activity = {
        progressUpdated: { title: '', description: 'Testing' }
      } as Activity;
      expect(component.getActivityMessage(activity)).toBe('Testing');
    });

    it('should fall back to description if progressUpdated fields are missing', () => {
      const activity = {
        description: 'Default desc',
        progressUpdated: { title: '', description: '' }
      } as Activity;
      expect(component.getActivityMessage(activity)).toBe('Default desc');
    });

    it('should handle artifacts: changeSet', () => {
      const activity = {
        artifacts: [{
          changeSet: {
            gitPatch: { suggestedCommitMessage: 'Update auth' }
          }
        }]
      } as any;
      expect(component.getActivityMessage(activity)).toBe('Code changes: Update auth');
    });

    it('should handle artifacts: bashOutput', () => {
      const activity = {
        artifacts: [{
          bashOutput: { command: 'npm test' }
        }]
      } as any;
      expect(component.getActivityMessage(activity)).toBe('Ran command: npm test');
    });

    it('should handle artifacts: media', () => {
      const activity = {
        artifacts: [{
          media: { mimeType: 'image/png' }
        }]
      } as any;
      expect(component.getActivityMessage(activity)).toBe('Generated media: image/png');
    });

    it('should handle multiple artifacts', () => {
      const activity = {
        artifacts: [
          { bashOutput: { command: 'ls' } },
          { media: { mimeType: 'text/plain' } }
        ]
      } as any;
      expect(component.getActivityMessage(activity)).toBe('Ran command: ls\nGenerated media: text/plain');
    });

    it('should return session completed message with description', () => {
      const activity = { sessionCompleted: {}, description: 'All done!' } as Activity;
      expect(component.getActivityMessage(activity)).toBe('All done!');
    });

    it('should return default session completed message', () => {
      const activity = { sessionCompleted: {} } as Activity;
      expect(component.getActivityMessage(activity)).toBe('Session completed successfully.');
    });

    it('should return session failed message', () => {
      const activity = { sessionFailed: { reason: 'Network error' } } as Activity;
      expect(component.getActivityMessage(activity)).toBe('Session failed: Network error');
    });

    it('should fall back to description if no specific type matches', () => {
      const activity = { description: 'Random event' } as Activity;
      expect(component.getActivityMessage(activity)).toBe('Random event');
    });
  });
});
