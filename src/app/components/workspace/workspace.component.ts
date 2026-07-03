import { Component, OnInit, OnDestroy, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterModule, Router } from '@angular/router';
import { Subscription, interval, startWith } from 'rxjs';
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
  private readonly router = inject(Router);

  selectedSource = signal<string | null>(null);
  defaultBranch = signal<string | null>(null);
  activeSessionId = signal<string | null>(null);
  session = signal<Session | null>(null);
  activities = signal<Activity[]>([]);
  nextPageToken = signal<string | undefined>(undefined);
  lastPageToken: string | undefined = undefined;

  newPrompt = signal<string>('');
  automationMode = signal<AutomationMode>(AutomationMode.AUTO_CREATE_PR);
  chatMessage = signal<string>('');
  isSendingMessage = signal<boolean>(false);

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
        if (this.activeSessionId() !== params['sessionId']) {
          this.activities.set([]);
          this.nextPageToken.set(undefined);
        }
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
        this.newPrompt.set('');
        this.loading.set(false);
        this.router.navigate(['/workspace'], { queryParams: { sessionId: session.name } });
      },
      error: (err) => {
        this.loading.set(false);
        console.error(err);
      }
    });
  }

  fetchSession(id: string) {
    this.apiService.getSession(id).subscribe(s => {
      this.session.set(s);
      this.addInitialPromptActivity(s);
    });
  }

  private addInitialPromptActivity(session: Session) {
    if (!session.prompt) return;

    const initialId = `initial-prompt-${session.id}`;
    this.activities.update(current => {
      if (current.some(a => a.id === initialId)) {
        return current;
      }

      const initialActivity: Activity = {
        id: initialId,
        name: `activities/${initialId}`,
        originator: 'user',
        description: session.prompt,
        createTime: session.createTime || new Date().toISOString(),
        userMessaged: {
          userMessage: session.prompt
        }
      };

      return [initialActivity, ...current];
    });
  }

  startPolling(id: string) {
    this.stopPolling();
    // Use interval to trigger a poll cycle
    this.pollingSub = interval(5000).pipe(
      startWith(0)
    ).subscribe(() => {
      this.pollCycle(id);
    });
  }

  private pollCycle(id: string) {
    this.apiService.getSessionActivities(id, this.nextPageToken()).subscribe({
      next: (res) => {
        if (res.activities && res.activities.length > 0) {
          this.activities.update(current => {
            const existingIds = new Set(current.map(a => a.id));
            const newActivities = (res.activities || []).filter(a => !existingIds.has(a.id));
            return [...current, ...newActivities];
          });
        }

        const newToken = res.nextPageToken;
        if (newToken && newToken !== this.lastPageToken) {
          this.lastPageToken = newToken;
          this.nextPageToken.set(newToken);
          // Recursive call to get next page immediately
          this.pollCycle(id);
        } else {
          this.lastPageToken = newToken;
        }

        // Keep session state updated
        this.fetchSession(id);

        // Final stop if terminal activity found
        if (res.activities && res.activities.some(a => a.sessionCompleted || a.sessionFailed)) {
          this.stopPolling();
        }
      },
      error: (err) => console.error(err)
    });
  }

  stopPolling() {
    this.pollingSub?.unsubscribe();
  }

  sendChatMessage(textareaElement?: HTMLTextAreaElement) {
    const id = this.activeSessionId();
    const msg = this.chatMessage();
    if (!id || !msg || this.isSendingMessage()) return;

    this.isSendingMessage.set(true);
    this.apiService.sendMessage(id, msg).subscribe({
      next: () => {
        this.chatMessage.set('');
        this.isSendingMessage.set(false);
        // Optimization: immediately poll or wait for next interval

        // Reset textarea height after sending
        setTimeout(() => {
          if (textareaElement) {
            textareaElement.style.height = 'auto';
          } else {
            const textarea = document.querySelector('.chat-input-wrapper textarea') as HTMLTextAreaElement;
            if (textarea) {
              textarea.style.height = 'auto';
            }
          }
        }, 0);
      },
      error: (err) => {
        this.isSendingMessage.set(false);
        console.error(err);
      }
    });
  }

  adjustHeight(textarea: HTMLTextAreaElement) {
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
  }

  onKeyDown(event: Event) {
    const keyboardEvent = event as KeyboardEvent;
    if (keyboardEvent.key === 'Enter' && !keyboardEvent.shiftKey) {
      event.preventDefault();
      this.sendChatMessage(event.target as HTMLTextAreaElement);
    }
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

  getPullRequestUrl(): string | undefined {
    return this.session()?.outputs?.find(o => o.pullRequest)?.pullRequest?.url;
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

  trackByActivityId(index: number, activity: Activity): string {
    return activity.id;
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
