import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { JulesApiService } from '../../services/jules-api.service';
import { Source, Session } from '../../models/jules.models';

@Component({
  selector: 'app-dashboard-layout',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './dashboard-layout.component.html',
  styleUrl: './dashboard-layout.component.scss'
})
export class DashboardLayoutComponent implements OnInit {
  private readonly apiService = inject(JulesApiService);
  private readonly router = inject(Router);

  sources = signal<Source[]>([]);
  sessions = signal<Session[]>([]);
  loading = signal<boolean>(true);
  error = signal<string | null>(null);
  sidebarOpen = signal<boolean>(false);

  ngOnInit() {
    this.loadSources();
    this.loadSessions();

    // Close sidebar on route change
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe(() => {
      this.sidebarOpen.set(false);
    });
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
        }
      },
      error: (err) => {
        this.error.set('Failed to load repositories');
        this.loading.set(false);
        console.error(err);
      }
    });
  }

  loadSessions() {
    this.apiService.getSessions().subscribe({
      next: (res) => {
        const sessions = res.sessions || [];
        // Sort sessions by createTime descending to show the most recent first
        sessions.sort((a, b) => {
          const timeA = a.createTime ? new Date(a.createTime).getTime() : 0;
          const timeB = b.createTime ? new Date(b.createTime).getTime() : 0;
          return timeB - timeA;
        });
        this.sessions.set(sessions);
      },
      error: (err) => {
        console.error('Failed to load sessions', err);
      }
    });
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

  setApiKey() {
    const key = prompt('Enter your Jules API Key:');
    if (key) {
      localStorage.setItem('JULES_API_KEY', key);
      window.location.reload();
    }
  }
}
