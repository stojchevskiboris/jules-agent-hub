import '@angular/compiler';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { of } from 'rxjs';

// Mock Angular's inject and signal
vi.mock('@angular/core', async () => {
  const actual = await vi.importActual('@angular/core');
  return {
    ...actual,
    inject: vi.fn(() => ({
      sessionCreated$: of(),
      getSessions: vi.fn().mockReturnValue(of({ sessions: [] })),
      getSources: vi.fn().mockReturnValue(of({ sources: [] }))
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
    },
    NavigationEnd: class {}
  };
});

import { DashboardLayoutComponent } from './dashboard-layout.component';
import { Session, ListSessionsResponse } from '../../models/jules.models';

describe('DashboardLayoutComponent (unit tests)', () => {
  let component: DashboardLayoutComponent;
  let mockApiService: any;

  beforeEach(() => {
    vi.clearAllMocks();
    component = new DashboardLayoutComponent();
    mockApiService = (component as any).apiService;
    mockApiService.getSessions.mockReturnValue(of({ sessions: [] }));
  });

  it('should initialize sessions and nextPageToken', () => {
    expect(component.sessions()).toEqual([]);
    expect(component.sessionNextPageToken()).toBeNull();
  });

  it('should initialize activeTab as sessions', () => {
    expect(component.activeTab()).toBe('sessions');
  });

  it('should change active tab', () => {
    component.setActiveTab('sources');
    expect(component.activeTab()).toBe('sources');
    component.setActiveTab('sessions');
    expect(component.activeTab()).toBe('sessions');
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
      expect(component.sessionNextPageToken()).toBe('token1');
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
      expect(component.sessionNextPageToken()).toBe('token2');
    });

    it('should sort sessions by createTime descending', () => {
      const mockResponse: ListSessionsResponse = {
        sessions: [
          { name: 'older', createTime: '2023-01-01T10:00:00Z', sourceContext: { source: 'repo1' } } as Session,
          { name: 'newer', createTime: '2023-01-01T12:00:00Z', sourceContext: { source: 'repo1' } } as Session
        ]
      };
      mockApiService.getSessions.mockReturnValue(of(mockResponse));

      component.loadSessions();

      expect(component.sessions()[0].name).toBe('newer');
      expect(component.sessions()[1].name).toBe('older');
    });

    it('should handle loading state correctly when loading more', () => {
      mockApiService.getSessions.mockReturnValue(of({ sessions: [] }));

      expect(component.loadingMoreSessions()).toBe(false);

      component.loadSessions('token1');

      expect(component.loadingMoreSessions()).toBe(false);
    });
  });

  describe('loadMoreSessions', () => {
    it('should not call loadSessions if sessionNextPageToken is null', () => {
      const spy = vi.spyOn(component, 'loadSessions');
      component.sessionNextPageToken.set(null);

      component.loadMoreSessions();

      expect(spy).not.toHaveBeenCalled();
    });

    it('should call loadSessions with token if sessionNextPageToken is present', () => {
      const spy = vi.spyOn(component, 'loadSessions');
      component.sessionNextPageToken.set('token123');

      component.loadMoreSessions();

      expect(spy).toHaveBeenCalledWith('token123');
    });
  });
});
