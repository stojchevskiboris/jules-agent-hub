import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { JulesApiService } from '../../services/jules-api.service';
import { Session, SessionState } from '../../models/jules.models';

@Component({
  selector: 'app-task-board',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './task-board.component.html',
  styleUrl: './task-board.component.scss'
})
export class TaskBoardComponent implements OnInit {
  private readonly apiService = inject(JulesApiService);

  sessions = signal<Session[]>([]);
  loading = signal<boolean>(true);
  selectedState = signal<string>('ALL');

  availableStates = ['ALL', 'ACTIVE', 'COMPLETED', 'FAILED'];

  filteredSessions = computed(() => {
    const all = this.sessions();
    const filter = this.selectedState();
    if (filter === 'ALL') return all;
    if (filter === 'ACTIVE') {
      return all.filter(s =>
        s.state === SessionState.QUEUED ||
        s.state === SessionState.PLANNING ||
        s.state === SessionState.AWAITING_PLAN_APPROVAL ||
        s.state === SessionState.AWAITING_USER_FEEDBACK ||
        s.state === SessionState.IN_PROGRESS
      );
    }
    return all.filter(s => s.state === filter);
  });

  activeTasks = computed(() =>
    this.sessions().filter(s =>
      s.state === SessionState.QUEUED ||
      s.state === SessionState.PLANNING ||
      s.state === SessionState.AWAITING_PLAN_APPROVAL ||
      s.state === SessionState.AWAITING_USER_FEEDBACK ||
      s.state === SessionState.IN_PROGRESS
    )
  );

  archivedTasks = computed(() =>
    this.sessions().filter(s => s.state === SessionState.COMPLETED || s.state === SessionState.FAILED)
  );

  ngOnInit() {
    this.loadSessions();
  }

  loadSessions() {
    this.loading.set(true);
    this.apiService.getSessions().subscribe({
      next: (res) => {
        this.sessions.set(res.sessions || []);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        console.error(err);
      }
    });
  }

  getShortName(fullName: string): string {
    return fullName.split('/').pop() || fullName;
  }

  truncateTitle(title: string | undefined, maxLength: number = 80): string {
    if (!title) return 'No title';
    if (title.length <= maxLength) return title;
    return title.substring(0, maxLength) + '...';
  }

  setStateFilter(state: string) {
    this.selectedState.set(state);
  }

  getPullRequest(session: Session) {
    return session.outputs?.find(o => o.pullRequest)?.pullRequest;
  }
}
