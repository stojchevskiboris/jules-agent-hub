import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
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
export class TaskBoardComponent implements OnInit, OnDestroy {
  private readonly apiService = inject(JulesApiService);

  sessions = signal<Session[]>([]);
  loading = signal<boolean>(true);
  selectedState = signal<string>('ALL');
  currentTime = signal<Date>(new Date());
  private timerInterval?: any;

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
    this.timerInterval = setInterval(() => {
      this.currentTime.set(new Date());
    }, 1000);
  }

  ngOnDestroy() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }
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

  isFinished(task: Session): boolean {
    const state = task.state;
    return state === SessionState.COMPLETED || state === SessionState.FAILED;
  }

  getStartedAt(task: Session): Date | null {
    return task.createTime ? new Date(task.createTime) : null;
  }

  getElapsed(task: Session): string {
    const startedAt = this.getStartedAt(task);
    if (!startedAt) return '0s';

    const diff = Math.floor((this.currentTime().getTime() - startedAt.getTime()) / 1000);
    return this.formatDuration(diff);
  }

  getWorkedFor(task: Session): string {
    if (!task.createTime || !task.updateTime) return '0s';

    const start = new Date(task.createTime).getTime();
    const end = new Date(task.updateTime).getTime();
    const diff = Math.floor((end - start) / 1000);
    return this.formatDuration(diff);
  }

  private formatDuration(seconds: number): string {
    if (seconds < 0) seconds = 0;
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;

    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  }
}
