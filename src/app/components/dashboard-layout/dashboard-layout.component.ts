import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
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

  ngOnInit() {
    this.loadSources();
    this.loadSessions();
  }

  loadSources() {
    this.loading.set(true);
    this.apiService.getSources().subscribe({
      next: (res) => {
        this.sources.set(res.sources || []);
        this.loading.set(false);
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

  selectSource(source: Source) {
    // Navigate to workspace with source as parameter
    this.router.navigate(['/workspace'], { queryParams: { source: source.name } });
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
