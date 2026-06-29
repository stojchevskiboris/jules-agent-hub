import { Component, OnInit, OnDestroy, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import { JulesApiService } from '../../services/jules-api.service';
import { Session, Activity } from '../../models/jules.models';

@Component({
  selector: 'app-workspace',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './workspace.component.html',
  styleUrl: './workspace.component.scss'
})
export class WorkspaceComponent implements OnInit, OnDestroy {
  private readonly apiService = inject(JulesApiService);
  private readonly route = inject(ActivatedRoute);

  selectedSource = signal<string | null>(null);
  activeSessionId = signal<string | null>(null);
  session = signal<Session | null>(null);
  activities = signal<Activity[]>([]);

  newPrompt = signal<string>('');
  automationMode = signal<'AUTO_CREATE_PR' | 'NONE'>('NONE');
  chatMessage = signal<string>('');

  loading = signal<boolean>(false);
  pollingSub?: Subscription;

  constructor() {
    effect(() => {
      const sessionId = this.activeSessionId();
      if (sessionId) {
        this.startPolling(sessionId);
        this.fetchSession(sessionId);
      } else {
        this.stopPolling();
      }
    });
  }

  ngOnInit() {
    this.route.queryParams.subscribe(params => {
      if (params['source']) {
        this.selectedSource.set(params['source']);
        this.activeSessionId.set(null);
        this.activities.set([]);
      }
      if (params['sessionId']) {
        this.activeSessionId.set(params['sessionId']);
      }
    });
  }

  ngOnDestroy() {
    this.stopPolling();
  }

  createSession() {
    const source = this.selectedSource();
    const prompt = this.newPrompt();
    if (!source || !prompt) return;

    this.loading.set(true);
    this.apiService.createSession(source, prompt, this.automationMode()).subscribe({
      next: (session) => {
        this.activeSessionId.set(session.name);
        this.newPrompt.set('');
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        console.error(err);
      }
    });
  }

  fetchSession(id: string) {
    this.apiService.getSession(id).subscribe(s => this.session.set(s));
  }

  startPolling(id: string) {
    this.stopPolling();
    this.pollingSub = this.apiService.pollSessionActivities(id).subscribe({
      next: (res) => {
        this.activities.set(res.activities || []);
      },
      error: (err) => console.error(err)
    });
  }

  stopPolling() {
    this.pollingSub?.unsubscribe();
  }

  sendChatMessage() {
    const id = this.activeSessionId();
    const msg = this.chatMessage();
    if (!id || !msg) return;

    this.apiService.sendMessage(id, msg).subscribe({
      next: () => {
        this.chatMessage.set('');
        // Optimization: immediately poll or wait for next interval
      },
      error: (err) => console.error(err)
    });
  }

  getShortName(fullName: string): string {
    return fullName.split('/').pop() || fullName;
  }
}
