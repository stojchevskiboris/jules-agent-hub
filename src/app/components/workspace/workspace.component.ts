import { Component, OnInit, OnDestroy, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { Subscription } from 'rxjs';
import { JulesApiService } from '../../services/jules-api.service';
import { Session, Activity, AutomationMode, SessionState } from '../../models/jules.models';

@Component({
  selector: 'app-workspace',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './workspace.component.html',
  styleUrl: './workspace.component.scss'
})
export class WorkspaceComponent implements OnInit, OnDestroy {
  private readonly apiService = inject(JulesApiService);
  private readonly route = inject(ActivatedRoute);

  selectedSource = signal<string | null>(null);
  defaultBranch = signal<string | null>(null);
  activeSessionId = signal<string | null>(null);
  session = signal<Session | null>(null);
  activities = signal<Activity[]>([]);

  newPrompt = signal<string>('');
  automationMode = signal<AutomationMode>(AutomationMode.AUTOMATION_MODE_UNSPECIFIED);
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
      if (params['defaultBranch']) {
        this.defaultBranch.set(params['defaultBranch']);
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
    this.apiService.createSession(source, prompt, this.automationMode(), this.defaultBranch() || undefined).subscribe({
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

  getActivityMessage(activity: Activity): string {
    if (activity.userMessaged) return activity.userMessaged.userMessage;
    if (activity.agentMessaged) return activity.agentMessaged.agentMessage;

    if (activity.planGenerated) {
      return activity.description || 'Generated a new plan.';
    }

    if (activity.planApproved) {
      return activity.description || 'Plan approved.';
    }

    if (activity.progressUpdated) {
      const title = activity.progressUpdated.title;
      const desc = activity.progressUpdated.description;
      if (title && desc) return `${title}: ${desc}`;
      return title || desc || activity.description || '';
    }

    if (activity.artifacts && activity.artifacts.length > 0) {
      const messages: string[] = [];
      for (const artifact of activity.artifacts) {
        if (artifact.changeSet) {
          messages.push(`Code changes: ${artifact.changeSet.gitPatch.suggestedCommitMessage}`);
        } else if (artifact.bashOutput) {
          messages.push(`Ran command: ${artifact.bashOutput.command}`);
        } else if (artifact.media) {
          messages.push(`Generated media: ${artifact.media.mimeType}`);
        }
      }
      if (messages.length > 0) return messages.join('\n');
    }

    if (activity.sessionCompleted !== undefined && activity.sessionCompleted !== null) {
      return activity.description || 'Session completed successfully.';
    }

    if (activity.sessionFailed) {
      return `Session failed: ${activity.sessionFailed.reason}`;
    }

    return activity.description || '';
  }

  approvePlan() {
    const id = this.activeSessionId();
    if (!id) return;
    this.apiService.approvePlan(id).subscribe({
      next: () => this.fetchSession(id),
      error: (err) => console.error(err)
    });
  }

  isAwaitingApproval() {
    return this.session()?.state === SessionState.AWAITING_PLAN_APPROVAL;
  }

  setAutomationMode(checked: boolean) {
    this.automationMode.set(checked ? AutomationMode.AUTO_CREATE_PR : AutomationMode.AUTOMATION_MODE_UNSPECIFIED);
  }

  truncateTitle(title: string | undefined, maxLength: number = 80): string {
    if (!title) return 'No title';
    if (title.length <= maxLength) return title;
    return title.substring(0, maxLength) + '...';
  }

  parseDiff(patch: string): { fileName: string; lines: { text: string; type: string }[] }[] {
    const files: { fileName: string; lines: { text: string; type: string }[] }[] = [];
    const lines = patch.split('\n');
    let currentFile: { fileName: string; lines: { text: string; type: string }[] } | null = null;

    for (const line of lines) {
      if (line.startsWith('diff --git')) {
        // Extract filename from "diff --git a/path/to/file b/path/to/file"
        const match = line.match(/b\/(.*)$/);
        const fileName = match ? match[1] : 'unknown file';
        currentFile = { fileName, lines: [] };
        files.push(currentFile);
      } else if (currentFile) {
        if (line.startsWith('---') || line.startsWith('+++') || line.startsWith('@@') || line.startsWith('index ')) {
          continue; // Skip technical metadata
        }

        let type = 'context';
        if (line.startsWith('+')) type = 'addition';
        else if (line.startsWith('-')) type = 'deletion';

        // Remove the +/- prefix for cleaner display if it's an addition or deletion
        const text = (type === 'addition' || type === 'deletion') ? line.substring(1) : line;

        // Don't add empty lines at the end of a file's diff
        if (text.trim() === '' && line === '') continue;

        currentFile.lines.push({ text, type });
      }
    }
    return files;
  }

}
