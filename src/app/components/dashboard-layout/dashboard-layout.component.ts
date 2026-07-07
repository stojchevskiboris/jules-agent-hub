import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router, NavigationEnd, ActivatedRoute } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';
import { JulesApiService } from '../../services/jules-api.service';
import { Source, Session } from '../../models/jules.models';

const API_KEY_ERROR_MESSAGE = 'Jules API key is needed';

@Component({
  selector: 'app-dashboard-layout',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './dashboard-layout.component.html',
  styleUrl: './dashboard-layout.component.scss'
})
export class DashboardLayoutComponent implements OnInit, OnDestroy {
  private readonly apiService = inject(JulesApiService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  sources = signal<Source[]>([]);
  sessions = signal<Session[]>([]);
  sessionNextPageToken = signal<string | null>(null);
  loading = signal<boolean>(true);
  loadingMoreSessions = signal<boolean>(false);
  error = signal<string | null>(null);
  sidebarOpen = signal<boolean>(false);
  apiKeyValid = signal<boolean>(false);
  sessionsExpanded = signal<boolean>(true);
  sourcesExpanded = signal<boolean>(true);

  currentSessionId = signal<string | null>(null);
  currentSource = signal<string | null>(null);

  activeSource = computed(() => {
    const directSource = this.currentSource();
    if (directSource) return directSource;

    const sessionId = this.currentSessionId();
    if (sessionId) {
      const session = this.sessions().find(s => s.name === sessionId);
      return session?.sourceContext.source || null;
    }

    return null;
  });

  private subs = new Subscription();

  // Expose constant to template
  protected readonly API_KEY_ERROR = API_KEY_ERROR_MESSAGE;

  ngOnInit() {
    this.checkApiKey();
    this.loadSources();
    this.loadSessions();

    // Refresh sessions when a new one is created
    this.subs.add(
      this.apiService.sessionCreated$.subscribe(() => {
        this.loadSessions();
      })
    );

    // Track query params for active state
    this.subs.add(
      this.route.queryParams.subscribe(params => {
        this.currentSessionId.set(params['sessionId'] || null);
        this.currentSource.set(params['source'] || null);
      })
    );

    // Close sidebar on route change
    this.subs.add(
      this.router.events.pipe(
        filter(event => event instanceof NavigationEnd)
      ).subscribe(() => {
        this.sidebarOpen.set(false);
      })
    );
  }

  ngOnDestroy() {
    this.subs.unsubscribe();
  }

  private checkApiKey() {
    try {
      const apiKey = localStorage.getItem('JULES_API_KEY');
      if (!apiKey) {
        this.error.set(API_KEY_ERROR_MESSAGE);
      }
    } catch (e) {
      this.error.set(API_KEY_ERROR_MESSAGE);
      console.error('Failed to access localStorage', e);
    }
  }

  loadSources(pageToken?: string, accumulatedSources: Source[] = []) {
    if (!pageToken) {
      this.loading.set(true);
    }
    this.apiService.getSources(pageToken).subscribe({
      next: (res) => {
        const currentSources = [...accumulatedSources, ...(res.sources || [])];
        if (res.nextPageToken) {
          this.loadSources(res.nextPageToken, currentSources);
        } else {
          this.sources.set(currentSources);
          this.loading.set(false);
          this.apiKeyValid.set(true);
          this.error.set(null);
        }
      },
      error: (err) => {
        if (err instanceof HttpErrorResponse && (err.status === 401 || err.status === 403)) {
          this.error.set(API_KEY_ERROR_MESSAGE);
          this.apiKeyValid.set(false);
        } else {
          this.error.set('Failed to load repositories');
        }
        this.loading.set(false);
        console.error(err);
      }
    });
  }

  loadSessions(pageToken?: string) {
    if (pageToken) {
      this.loadingMoreSessions.set(true);
    }
    this.apiService.getSessions(pageToken).subscribe({
      next: (res) => {
        let currentSessions = res.sessions || [];
        if (pageToken) {
          currentSessions = [...this.sessions(), ...currentSessions];
        }

        // Sort sessions by createTime descending to show the most recent first
        currentSessions.sort((a, b) => {
          const timeA = a.createTime ? new Date(a.createTime).getTime() : 0;
          const timeB = b.createTime ? new Date(b.createTime).getTime() : 0;
          return timeB - timeA;
        });

        this.sessions.set(currentSessions);
        this.sessionNextPageToken.set(res.nextPageToken || null);
        this.loadingMoreSessions.set(false);
      },
      error: (err) => {
        console.error('Failed to load sessions', err);
        this.loadingMoreSessions.set(false);
      }
    });
  }

  loadMoreSessions() {
    const token = this.sessionNextPageToken();
    if (token) {
      this.loadSessions(token);
    }
  }

  toggleSessions() {
    this.sessionsExpanded.update(v => !v);
  }

  toggleSources() {
    this.sourcesExpanded.update(v => !v);
  }

  toggleSidebar() {
    this.sidebarOpen.update(v => !v);
  }

  closeSidebar() {
    this.sidebarOpen.set(false);
  }

  selectSource(source: Source) {
    // Navigate to workspace with source as parameter
    this.router.navigate(['/workspace'], { queryParams: { source: source.name, defaultBranch: source.githubRepo.defaultBranch.displayName } });
  }

  selectSession(session: Session) {
    this.router.navigate(['/workspace'], { queryParams: { sessionId: session.name } });
  }

  getShortName(fullName: string): string {
    return fullName.split('/').pop() || fullName;
  }

  truncateTitle(title: string | undefined, maxLength: number = 80): string {
    if (!title) return 'No title';
    if (title.length <= maxLength) return title;
    return title.substring(0, maxLength) + '...';
  }

  getPullRequest(session: Session) {
    return session.outputs?.find(o => o.pullRequest)?.pullRequest;
  }

  isAwaitingFeedback(session: Session) {
    return session.state === 'AWAITING_USER_FEEDBACK';
  }

  setApiKey() {
    const key = prompt('Enter your Jules API Key:');
    if (key) {
      localStorage.setItem('JULES_API_KEY', key);
      window.location.reload();
    }
  }
}
