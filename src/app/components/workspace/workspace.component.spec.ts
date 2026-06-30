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
    signal: vi.fn((val) => {
      const s = () => val;
      s.set = vi.fn();
      return s;
    }),
    effect: vi.fn()
  };
});

vi.mock('@angular/router', () => ({
  ActivatedRoute: vi.fn(),
  RouterModule: {
    forRoot: vi.fn()
  }
}));

describe('WorkspaceComponent (unit tests)', () => {
  const component = new WorkspaceComponent();

  describe('getActivityMessage', () => {
    it('should return user message', () => {
      const activity = { userMessaged: { userMessage: 'Hello Jules' } } as Activity;
      expect(component.getActivityMessage(activity)).toBe('Hello Jules');
    });

    it('should return agent message', () => {
      const activity = { agentMessaged: { agentMessage: 'Hello User' } } as Activity;
      expect(component.getActivityMessage(activity)).toBe('Hello User');
    });

    it('should return plan generated message', () => {
      const activity = { planGenerated: {} } as Activity;
      expect(component.getActivityMessage(activity)).toBe('Generated a new plan.');
    });

    it('should return plan approved message', () => {
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

    it('should return session completed message', () => {
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
