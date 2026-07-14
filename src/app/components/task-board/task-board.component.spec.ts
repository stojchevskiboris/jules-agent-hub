import '@angular/compiler';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { of } from 'rxjs';

// Mock Angular's inject and signal
vi.mock('@angular/core', async () => {
  const actual = await vi.importActual('@angular/core');
  return {
    ...actual,
    inject: vi.fn(() => ({
      getSessions: vi.fn().mockReturnValue(of({ sessions: [] }))
    })),
    signal: vi.fn((initialValue) => {
      let value = initialValue;
      const s = vi.fn(() => value);
      (s as any).set = vi.fn((newValue) => { value = newValue; });
      (s as any).update = vi.fn((updateFn) => { value = updateFn(value); });
      return s;
    }),
    computed: vi.fn((fn) => {
      const s = vi.fn(() => fn());
      return s;
    }),
    effect: vi.fn()
  };
});

vi.mock('@angular/router', () => {
  return {
    ActivatedRoute: {
      queryParams: of({})
    },
    Router: {
      events: of(),
      navigate: vi.fn()
    },
    RouterModule: {
      forRoot: vi.fn()
    }
  };
});

import { TaskBoardComponent } from './task-board.component';
import { Session, ListSessionsResponse } from '../../models/jules.models';

describe('TaskBoardComponent (unit tests)', () => {
  let component: TaskBoardComponent;
  let mockApiService: any;

  beforeEach(() => {
    vi.clearAllMocks();
    component = new TaskBoardComponent();
    mockApiService = (component as any).apiService;
    mockApiService.getSessions.mockReturnValue(of({ sessions: [] }));
  });

  it('should initialize sessions, nextPageToken, and loadingMore', () => {
    expect(component.sessions()).toEqual([]);
    expect(component.nextPageToken()).toBeNull();
    expect(component.loadingMore()).toBe(false);
  });

  describe('loadSessions', () => {
    it('should load initial sessions and set nextPageToken', () => {
      const mockResponse: ListSessionsResponse = {
        sessions: [
          { name: 'session1', createTime: '2023-01-01T12:00:00Z', sourceContext: { source: 'repo1' } } as Session
        ],
        nextPageToken: 'token1'
      };
      mockApiService.getSessions.mockReturnValue(of(mockResponse));

      component.loadSessions();

      expect(mockApiService.getSessions).toHaveBeenCalledWith(undefined);
      expect(component.sessions()).toHaveLength(1);
      expect(component.sessions()[0].name).toBe('session1');
      expect(component.nextPageToken()).toBe('token1');
    });

    it('should append sessions when pageToken is provided', () => {
      const initialSession = { name: 'session1', createTime: '2023-01-01T12:00:00Z', sourceContext: { source: 'repo1' } } as Session;
      component.sessions.set([initialSession]);

      const mockResponse: ListSessionsResponse = {
        sessions: [
          { name: 'session2', createTime: '2023-01-01T11:00:00Z', sourceContext: { source: 'repo1' } } as Session
        ],
        nextPageToken: 'token2'
      };
      mockApiService.getSessions.mockReturnValue(of(mockResponse));

      component.loadSessions('token1');

      expect(mockApiService.getSessions).toHaveBeenCalledWith('token1');
      expect(component.sessions()).toHaveLength(2);
      expect(component.sessions()).toContainEqual(initialSession);
      expect(component.sessions().find(s => s.name === 'session2')).toBeDefined();
      expect(component.nextPageToken()).toBe('token2');
    });

    it('should update loadingMore state correctly', () => {
      const mockResponse: ListSessionsResponse = {
        sessions: [
          { name: 'session1', createTime: '2023-01-01T12:00:00Z', sourceContext: { source: 'repo1' } } as Session
        ],
        nextPageToken: 'token1'
      };
      mockApiService.getSessions.mockReturnValue(of(mockResponse));

      component.loadSessions('token1');
      expect(component.loadingMore()).toBe(false);
    });
  });

  describe('loadMoreSessions', () => {
    it('should not call loadSessions if nextPageToken is null', () => {
      const spy = vi.spyOn(component, 'loadSessions');
      component.nextPageToken.set(null);

      component.loadMoreSessions();

      expect(spy).not.toHaveBeenCalled();
    });

    it('should call loadSessions with token if nextPageToken is present', () => {
      const spy = vi.spyOn(component, 'loadSessions');
      component.nextPageToken.set('token123');

      component.loadMoreSessions();

      expect(spy).toHaveBeenCalledWith('token123');
    });
  });
});
