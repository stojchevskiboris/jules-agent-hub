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
      getSources: vi.fn().mockReturnValue(of({ sources: [] })),
      deleteSession: vi.fn().mockReturnValue(of(undefined))
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
  let localStorageMock: any;
  let store: Record<string, string>;

  beforeEach(() => {
    vi.clearAllMocks();
    component = new DashboardLayoutComponent();
    mockApiService = (component as any).apiService;
    mockApiService.getSessions.mockReturnValue(of({ sessions: [] }));

    store = {};
    localStorageMock = {
      getItem: vi.fn((key: string) => store[key] || null),
      setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
      removeItem: vi.fn((key: string) => { delete store[key]; })
    };
    vi.stubGlobal('localStorage', localStorageMock);
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

  it('should prefill the Jules API key prompt when a key already exists', () => {
    localStorage.setItem('JULES_API_KEY', 'existing-jules-key');

    const promptSpy = vi.fn(() => null);
    vi.stubGlobal('prompt', promptSpy);

    component.setApiKey();

    expect(promptSpy).toHaveBeenCalledWith('Enter your Jules API Key:', 'existing-jules-key');
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

  describe('Session Menu Actions', () => {
    let mockSession: Session;
    let mockEvent: any;

    beforeEach(() => {
      mockSession = {
        name: 'sessions/123',
        id: '123',
        prompt: 'Test task',
        title: 'Test Session',
        state: 'IN_PROGRESS',
        url: 'https://jules.google.com/session/123',
        sourceContext: { source: 'sources/repo1' }
      };
      mockEvent = {
        stopPropagation: vi.fn()
      };
      component.sessions.set([mockSession]);
    });

    it('should toggle session menu open and closed', () => {
      expect(component.openMenuSessionId()).toBeNull();

      component.toggleSessionMenu(mockSession, mockEvent);

      expect(mockEvent.stopPropagation).toHaveBeenCalled();
      expect(component.openMenuSessionId()).toBe('sessions/123');

      component.toggleSessionMenu(mockSession, mockEvent);

      expect(component.openMenuSessionId()).toBeNull();
    });

    it('should pause an active session when togglePauseSession is called', () => {
      component.openMenuSessionId.set('sessions/123');

      component.togglePauseSession(mockSession, mockEvent);

      expect(mockEvent.stopPropagation).toHaveBeenCalled();
      expect(component.sessions()[0].state).toBe('PAUSED');
      expect(component.openMenuSessionId()).toBeNull();
    });

    it('should resume a paused session when togglePauseSession is called', () => {
      const pausedSession = { ...mockSession, state: 'PAUSED' };
      component.sessions.set([pausedSession]);
      component.openMenuSessionId.set('sessions/123');

      component.togglePauseSession(pausedSession, mockEvent);

      expect(component.sessions()[0].state).toBe('IN_PROGRESS');
      expect(component.openMenuSessionId()).toBeNull();
    });

    it('should copy session URL using navigator.clipboard', () => {
      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      vi.stubGlobal('navigator', {
        clipboard: { writeText: writeTextMock }
      });
      component.openMenuSessionId.set('sessions/123');

      component.copySessionUrl(mockSession, mockEvent);

      expect(mockEvent.stopPropagation).toHaveBeenCalled();
      expect(writeTextMock).toHaveBeenCalledWith('https://jules.google.com/session/123');
      expect(component.openMenuSessionId()).toBeNull();
    });

    it('should archive session by calling deleteSession API and removing it from list', () => {
      mockApiService.deleteSession.mockReturnValue(of(undefined));
      component.openMenuSessionId.set('sessions/123');

      component.archiveSession(mockSession, mockEvent);

      expect(mockEvent.stopPropagation).toHaveBeenCalled();
      expect(mockApiService.deleteSession).toHaveBeenCalledWith('sessions/123');
      expect(component.sessions()).toHaveLength(0);
      expect(component.openMenuSessionId()).toBeNull();
    });

    it('should close menu on document click outside .session-menu-container', () => {
      component.openMenuSessionId.set('sessions/123');

      const mockTarget = { closest: vi.fn().mockReturnValue(null) };
      component.onDocumentClick({ target: mockTarget } as any);

      expect(component.openMenuSessionId()).toBeNull();
    });
  });
});
