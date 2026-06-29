import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { JulesApiService } from '../../services/jules-api.service';
import { Session } from '../../models/jules.models';

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

  activeTasks = computed(() =>
    this.sessions().filter(s => !s.outputs?.pullRequest)
  );

  archivedTasks = computed(() =>
    this.sessions().filter(s => !!s.outputs?.pullRequest)
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
}
