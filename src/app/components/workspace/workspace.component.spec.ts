import '@angular/compiler';
import { WorkspaceComponent } from './workspace.component';
import { Activity, Session } from '../../models/jules.models';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { of } from 'rxjs';

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

  describe('parseMarkdown', () => {
    it('should parse plain text', () => {
      const text = 'Hello world';
      const result = component.parseMarkdown(text);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ type: 'text', content: 'Hello world' });
    });

    it('should parse inline code', () => {
      const text = 'Use `code` here';
      const result = component.parseMarkdown(text);
      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ type: 'text', content: 'Use ' });
      expect(result[1]).toEqual({ type: 'inline-code', content: 'code' });
      expect(result[2]).toEqual({ type: 'text', content: ' here' });
    });

    it('should parse code blocks with language', () => {
      const text = '```scss\n.body { color: red; }\n```';
      const result = component.parseMarkdown(text);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        type: 'code-block',
        language: 'scss',
        content: '.body { color: red; }'
      });
    });

    it('should parse code blocks without language', () => {
      const text = '```\nplain text\n```';
      const result = component.parseMarkdown(text);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        type: 'code-block',
        language: 'text',
        content: 'plain text'
      });
    });

    it('should parse headings', () => {
      const text = '# Heading 1\n### Heading 3';
      const result = component.parseMarkdown(text);
      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ type: 'heading', level: 1, content: [{ type: 'text', content: 'Heading 1' }] });
      expect(result[1]).toEqual({ type: 'text', content: '\n' });
      expect(result[2]).toEqual({ type: 'heading', level: 3, content: [{ type: 'text', content: 'Heading 3' }] });
    });

    it('should parse list items', () => {
      const text = '- item 1\n* item 2';
      const result = component.parseMarkdown(text);
      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ type: 'list-item', content: [{ type: 'text', content: 'item 1' }] });
      expect(result[1]).toEqual({ type: 'text', content: '\n' });
      expect(result[2]).toEqual({ type: 'list-item', content: [{ type: 'text', content: 'item 2' }] });
    });

    it('should parse bold and italic', () => {
      const text = '**bold** and *italic*';
      const result = component.parseMarkdown(text);
      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ type: 'bold', content: 'bold' });
      expect(result[1]).toEqual({ type: 'text', content: ' and ' });
      expect(result[2]).toEqual({ type: 'italic', content: 'italic' });
    });

    it('should parse mixed content', () => {
      const text = '# Intro\nIntro `inline` text.\n```ts\nconst x = 1;\n```\n- item\n**Bold**';
      const result = component.parseMarkdown(text);
      // Expected segments:
      // 0: heading Intro
      // 1: text \n
      // 2: text Intro
      // 3: inline-code inline
      // 4: text  text.\n
      // 5: code-block
      // 6: text \n (after code block)
      // 7: list-item item
      // 8: text \n (after list item)
      // 9: bold Bold
      expect(result).toHaveLength(10);
      expect(result[0].type).toBe('heading');
      expect(result[0].content[0].content).toBe('Intro');
      expect(result[1].content).toBe('\n');
      expect(result[2].content).toBe('Intro ');
      expect(result[3].type).toBe('inline-code');
      expect(result[4].content).toBe(' text.\n');
      expect(result[5].type).toBe('code-block');
      expect(result[6].content).toBe('\n');
      expect(result[7].type).toBe('list-item');
      expect(result[7].content[0].content).toBe('item');
      expect(result[8].content).toBe('\n');
      expect(result[9].type).toBe('bold');
    });

    it('should handle undefined text', () => {
      expect(component.parseMarkdown(undefined)).toEqual([]);
    });
  });

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

    it('should handle null or undefined patch gracefully', () => {
      expect(component.parseDiff(null as any)).toEqual([]);
      expect(component.parseDiff(undefined as any)).toEqual([]);
    });
  });

  describe('chat sending state', () => {
    it('should initialize isSendingMessage as false', () => {
      expect(component.isSendingMessage()).toBe(false);
    });
  });

  describe('initial prompt activity', () => {
    it('should prepend initial prompt activity when fetchSession is called', () => {
      const mockSession: Session = {
        id: '123',
        name: 'sessions/123',
        prompt: 'Initial prompt',
        sourceContext: { source: 'repo' }
      };

      // Mock apiService.getSession
      (component as any).apiService.getSession = vi.fn().mockReturnValue(of(mockSession));

      component.fetchSession('123');

      const activities = component.activities();
      expect(activities).toHaveLength(1);
      expect(activities[0].id).toBe('initial-prompt-123');
      expect(activities[0].userMessaged?.userMessage).toBe('Initial prompt');
      expect(activities[0].originator).toBe('user');
    });

    it('should not prepend duplicate initial prompt activity', () => {
      const mockSession: Session = {
        id: '123',
        name: 'sessions/123',
        prompt: 'Initial prompt',
        sourceContext: { source: 'repo' }
      };

      (component as any).apiService.getSession = vi.fn().mockReturnValue(of(mockSession));

      component.fetchSession('123');
      component.fetchSession('123');

      const activities = component.activities();
      expect(activities).toHaveLength(1);
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

    it('should handle artifacts: video media', () => {
      const activity = {
        artifacts: [{
          media: { mimeType: 'video/webm' }
        }]
      } as any;
      expect(component.getActivityMessage(activity)).toBe('Generated media: video/webm');
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

  describe('sessionsAreEqual', () => {
    it('should return true for identical sessions', () => {
      const s1: Session = { name: 's1', state: 'RUNNING', title: 'T1', outputs: [], sourceContext: { source: 'r' } } as any;
      expect((component as any).sessionsAreEqual(s1, s1)).toBe(true);
    });

    it('should return true for equal sessions', () => {
      const s1: Session = { name: 's1', state: 'RUNNING', title: 'T1', outputs: [{ pullRequest: { url: 'u1' } }], sourceContext: { source: 'r' } } as any;
      const s2: Session = { name: 's1', state: 'RUNNING', title: 'T1', outputs: [{ pullRequest: { url: 'u1' } }], sourceContext: { source: 'r' } } as any;
      expect((component as any).sessionsAreEqual(s1, s2)).toBe(true);
    });

    it('should return false for different names', () => {
      const s1: Session = { name: 's1', state: 'RUNNING', title: 'T1' } as any;
      const s2: Session = { name: 's2', state: 'RUNNING', title: 'T1' } as any;
      expect((component as any).sessionsAreEqual(s1, s2)).toBe(false);
    });

    it('should return false for different states', () => {
      const s1: Session = { name: 's1', state: 'RUNNING', title: 'T1' } as any;
      const s2: Session = { name: 's1', state: 'COMPLETED', title: 'T1' } as any;
      expect((component as any).sessionsAreEqual(s1, s2)).toBe(false);
    });

    it('should return false for different titles', () => {
      const s1: Session = { name: 's1', state: 'RUNNING', title: 'T1' } as any;
      const s2: Session = { name: 's1', state: 'RUNNING', title: 'T2' } as any;
      expect((component as any).sessionsAreEqual(s1, s2)).toBe(false);
    });

    it('should return false for different outputs', () => {
      const s1: Session = { name: 's1', state: 'RUNNING', title: 'T1', outputs: [] } as any;
      const s2: Session = { name: 's1', state: 'RUNNING', title: 'T1', outputs: [{ pullRequest: { url: 'u1' } }] } as any;
      expect((component as any).sessionsAreEqual(s1, s2)).toBe(false);
    });
  });

  describe('expandedDiffs', () => {
    it('should track expanded diffs', () => {
      expect(component.isDiffExpanded('a1', 'f1')).toBe(false);
      component.toggleDiff('a1', 'f1', true);
      expect(component.isDiffExpanded('a1', 'f1')).toBe(true);
      component.toggleDiff('a1', 'f1', false);
      expect(component.isDiffExpanded('a1', 'f1')).toBe(false);
    });

    it('should track multiple diffs independently', () => {
      component.toggleDiff('a1', 'f1', true);
      component.toggleDiff('a1', 'f2', true);
      component.toggleDiff('a2', 'f1', true);

      expect(component.isDiffExpanded('a1', 'f1')).toBe(true);
      expect(component.isDiffExpanded('a1', 'f2')).toBe(true);
      expect(component.isDiffExpanded('a2', 'f1')).toBe(true);
      expect(component.isDiffExpanded('a2', 'f2')).toBe(false);
    });
  });

  describe('getSourceUrl', () => {
    it('should return null for null, undefined, or empty string', () => {
      expect(component.getSourceUrl(null)).toBeNull();
      expect(component.getSourceUrl(undefined)).toBeNull();
      expect(component.getSourceUrl('')).toBeNull();
      expect(component.getSourceUrl('   ')).toBeNull();
    });

    it('should strip sources/ prefix', () => {
      expect(component.getSourceUrl('sources/github.com/google/guava')).toBe('https://github.com/google/guava');
    });

    it('should keep existing http or https protocol', () => {
      expect(component.getSourceUrl('https://github.com/google/guava')).toBe('https://github.com/google/guava');
      expect(component.getSourceUrl('http://github.com/google/guava')).toBe('http://github.com/google/guava');
    });

    it('should prefix https to github.com/ references', () => {
      expect(component.getSourceUrl('github.com/google/guava')).toBe('https://github.com/google/guava');
    });

    it('should prefix github.com for owner/repo formats', () => {
      expect(component.getSourceUrl('google/guava')).toBe('https://github.com/google/guava');
    });
  });

  describe('In-Place Prompt Refinement', () => {
    let originalFetch: any;
    let originalAlert: any;
    let originalPrompt: any;
    let localStorageMock: any;
    let store: Record<string, string>;

    beforeEach(() => {
      originalFetch = globalThis.fetch;
      originalAlert = globalThis.alert;
      originalPrompt = globalThis.prompt;
      vi.stubGlobal('alert', vi.fn());
      vi.stubGlobal('prompt', vi.fn());

      store = {};
      localStorageMock = {
        getItem: vi.fn((key: string) => store[key] || null),
        setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
        removeItem: vi.fn((key: string) => { delete store[key]; }),
        clear: vi.fn(() => { store = {}; })
      };
      vi.stubGlobal('localStorage', localStorageMock);

      component.newPrompt.set('');
      component.refining.set(false);
      component.toastError.set(null);
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
      globalThis.alert = originalAlert;
      globalThis.prompt = originalPrompt;
      vi.unstubAllGlobals();
    });

    it('should do nothing if raw prompt is empty', async () => {
      const fetchSpy = vi.fn();
      vi.stubGlobal('fetch', fetchSpy);

      await component.refinePrompt();
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(component.refining()).toBe(false);
    });

    it('should trigger warning and alert if GOOGLE_API_KEY is not in localStorage', async () => {
      component.newPrompt.set('implement a order module');

      const alertSpy = vi.fn();
      vi.stubGlobal('alert', alertSpy);

      const promptSpy = vi.fn(() => 'new-secret-key');
      vi.stubGlobal('prompt', promptSpy);

      await component.refinePrompt();

      expect(alertSpy).toHaveBeenCalledWith('Enter valid Google API key to use this function');
      expect(component.toastError()).toBe('Enter valid Google API key to use this function');
      expect(promptSpy).toHaveBeenCalled();
    });

    it('should set refined prompt on successful Gemini API fetch', async () => {
      localStorage.setItem('GOOGLE_API_KEY', 'valid-api-key-123');
      component.newPrompt.set('basic task');

      const mockResponse = {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: 'Highly detailed professional copywriter prompt here'
                }
              ]
            }
          }
        ]
      };

      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });
      vi.stubGlobal('fetch', fetchSpy);

      await component.refinePrompt();

      expect(fetchSpy).toHaveBeenCalled();
      const fetchArgs = fetchSpy.mock.calls[0];
      expect(fetchArgs[0]).toContain('gemini-2.5-flash');
      expect(fetchArgs[0]).toContain('key=valid-api-key-123');
      expect(JSON.parse(fetchArgs[1].body)).toEqual({
        contents: [
          {
            parts: [
              {
                text: 'You are an expert developer. Your task is to redefine and technically and professionaly structure the next promt:\n\n"basic task"\n\nReturn only the redefined promt Without any other conclusions or extra text in the language in which user asked.'
              }
            ]
          }
        ]
      });

      expect(component.newPrompt()).toBe('Highly detailed professional copywriter prompt here');
      expect(component.refining()).toBe(false);
      expect(component.toastError()).toBeNull();
    });

    it('should handle API fetch error and show toast', async () => {
      localStorage.setItem('GOOGLE_API_KEY', 'valid-api-key-123');
      component.newPrompt.set('basic task');

      const fetchSpy = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: async () => ({ error: { message: 'Quota exceeded or invalid key' } })
      });
      vi.stubGlobal('fetch', fetchSpy);

      await component.refinePrompt();

      expect(component.refining()).toBe(false);
      expect(component.toastError()).toBe('Quota exceeded or invalid key');
      expect(component.newPrompt()).toBe('basic task');
    });
  });
});
