import { Component, OnInit, OnDestroy, AfterViewInit, inject, signal, effect, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ActivatedRoute, RouterModule, Router } from '@angular/router';
import { Subscription, interval, startWith } from 'rxjs';
import { JulesApiService } from '../../services/jules-api.service';
import { Session, Activity, AutomationMode, SessionState } from '../../models/jules.models';

interface MarkdownPart {
  type: string;
  content: string | MarkdownPart[];
  language?: string;
  level?: number;
  index?: string | number;
}

@Component({
  selector: 'app-workspace',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './workspace.component.html',
  styleUrl: './workspace.component.scss'
})
export class WorkspaceComponent implements OnInit, OnDestroy, AfterViewInit {
  private readonly apiService = inject(JulesApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly sanitizer = inject(DomSanitizer);

  @ViewChild('scrollContainer') activityFeed?: ElementRef<HTMLDivElement>;

  selectedSource = signal<string | null>(null);
  defaultBranch = signal<string | null>(null);
  activeSessionId = signal<string | null>(null);
  session = signal<Session | null>(null);
  activities = signal<Activity[]>([]);
  nextPageToken = signal<string | undefined>(undefined);

  newPrompt = signal<string>('');
  automationMode = signal<AutomationMode>(AutomationMode.AUTO_CREATE_PR);
  chatMessage = signal<string>('');
  isSendingMessage = signal<boolean>(false);

  loading = signal<boolean>(false);
  showScrollButton = signal<boolean>(false);
  hasNewMessages = signal<boolean>(false);
  expandedDiffs = signal<Set<string>>(new Set());
  pollingSub?: Subscription;
  currentTime = signal<Date>(new Date());
  private timerInterval?: any;

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

  ngAfterViewInit() {
    setTimeout(() => this.onScroll(), 500);
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

    this.timerInterval = setInterval(() => {
      this.currentTime.set(new Date());
    }, 1000);
  }

  ngOnDestroy() {
    this.stopPolling();
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }
  }

  checkIfAtBottom(): boolean {
    if (!this.activityFeed) return false;
    const el = this.activityFeed.nativeElement;
    // Threshold of 20px to consider "at bottom"
    return el.scrollHeight - el.scrollTop <= el.clientHeight + 20;
  }

  onScroll() {
    const atBottom = this.checkIfAtBottom();
    this.showScrollButton.set(!atBottom);
    if (atBottom) {
      this.hasNewMessages.set(false);
    }
  }

  scrollToBottom() {
    setTimeout(() => {
      if (this.activityFeed) {
        const el = this.activityFeed.nativeElement;
        el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
        this.hasNewMessages.set(false);
      }
    }, 0);
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
      if (!this.sessionsAreEqual(this.session(), s)) {
        this.session.set(s);
      }
      this.addInitialPromptActivity(s);
    });
  }

  private sessionsAreEqual(s1: Session | null, s2: Session | null): boolean {
    if (s1 === s2) return true;
    if (!s1 || !s2) return false;

    // Compare meaningful properties to determine if a refresh is needed
    return s1.name === s2.name &&
      s1.state === s2.state &&
      s1.title === s2.title &&
      JSON.stringify(s1.outputs) === JSON.stringify(s2.outputs);
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
        const incomingActivities = res.activities || [];
        const existingIds = new Set(this.activities().map(a => a.id));
        const newActivities = incomingActivities.filter(a => !existingIds.has(a.id));

        const wasAtBottom = this.checkIfAtBottom();

        if (newActivities.length > 0) {
          this.activities.update(current => [...current, ...newActivities]);

          if (this.isInProgress()) {
            if (wasAtBottom) {
              this.scrollToBottom();
            } else {
              this.hasNewMessages.set(true);
            }
          }
        }

        const newToken = res.nextPageToken;
        if (newToken && newToken !== this.nextPageToken()) {
          this.nextPageToken.set(newToken);
          // Recursive call to get next page immediately
          this.pollCycle(id);
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

  getPullRequest() {
    return this.session()?.outputs?.find(o => o.pullRequest)?.pullRequest;
  }

  getPullRequestUrl(): string | undefined {
    return this.getPullRequest()?.url;
  }

  isAwaitingApproval() {
    return this.session()?.state === SessionState.AWAITING_PLAN_APPROVAL;
  }

  isAwaitingFeedback() {
    return this.session()?.state === SessionState.AWAITING_USER_FEEDBACK;
  }

  isInProgress() {
    return this.session()?.state === SessionState.IN_PROGRESS;
  }

  isFinished(): boolean {
    const state = this.session()?.state;
    return state === SessionState.COMPLETED || state === SessionState.FAILED;
  }

  getStartedAt(): Date | null {
    const createTime = this.session()?.createTime;
    return createTime ? new Date(createTime) : null;
  }

  getElapsed(): string {
    const startedAt = this.getStartedAt();
    if (!startedAt) return '0s';

    const diff = Math.floor((this.currentTime().getTime() - startedAt.getTime()) / 1000);
    return this.formatDuration(diff);
  }

  getWorkedFor(): string {
    const session = this.session();
    if (!session || !session.createTime || !session.updateTime) return '0s';

    const start = new Date(session.createTime).getTime();
    const end = new Date(session.updateTime).getTime();
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

  setAutomationMode(checked: boolean) {
    this.automationMode.set(checked ? AutomationMode.AUTO_CREATE_PR : AutomationMode.AUTOMATION_MODE_UNSPECIFIED);
  }

  truncateTitle(title: string | undefined, maxLength: number = 80): string {
    if (!title) return 'No title';
    if (title.length <= maxLength) return title;
    return title.substring(0, maxLength) + '...';
  }

  getSafeUrl(mimeType: string, data: string): SafeResourceUrl {
    return this.sanitizer.bypassSecurityTrustResourceUrl(`data:${mimeType};base64,${data}`);
  }

  trackByActivityId(index: number, activity: Activity): string {
    return activity.id;
  }

  trackByFileName(index: number, file: any): string {
    return file.fileName;
  }

  isDiffExpanded(activityId: string, fileName: string): boolean {
    return this.expandedDiffs().has(`${activityId}-${fileName}`);
  }

  toggleDiff(activityId: string, fileName: string, open: boolean) {
    const key = `${activityId}-${fileName}`;
    this.expandedDiffs.update(current => {
      const next = new Set(current);
      if (open) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return next;
    });
  }

  asArray(content: string | MarkdownPart[]): MarkdownPart[] {
    return Array.isArray(content) ? content : [];
  }

  parseMarkdown(text: string | undefined): MarkdownPart[] {
    if (!text) return [];

    const segments: MarkdownPart[] = [];
    const codeBlockRegex = /```(\w+)?\n?([\s\S]*?)```/g;
    let lastIndex = 0;
    let match;

    while ((match = codeBlockRegex.exec(text)) !== null) {
      const before = text.substring(lastIndex, match.index);
      if (before) {
        segments.push(...this.parseLineElements(before));
      }

      segments.push({
        type: 'code-block',
        language: match[1] || 'text',
        content: match[2].trim()
      });

      lastIndex = codeBlockRegex.lastIndex;
    }

    const remaining = text.substring(lastIndex);
    if (remaining) {
      // If there's a code block before this, the remaining text might start with a newline
      // that we want to preserve if it's not the only thing there.
      segments.push(...this.parseLineElements(remaining));
    }

    return segments;
  }

  private parseLineElements(text: string): MarkdownPart[] {
    const lines = text.split('\n');
    const result: MarkdownPart[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line === '' && i === lines.length - 1 && i > 0) continue;

      // Heading: # Heading
      const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
      if (headingMatch) {
        result.push({
          type: 'heading',
          level: headingMatch[1].length,
          content: this.parseInline(headingMatch[2])
        });
        if (i < lines.length - 1) result.push({ type: 'text', content: '\n' });
        continue;
      }

      // List item: - item or * item
      const listMatch = line.match(/^([-*+])\s+(.*)$/);
      if (listMatch) {
        result.push({
          type: 'list-item',
          content: this.parseInline(listMatch[2])
        });
        if (i < lines.length - 1) result.push({ type: 'text', content: '\n' });
        continue;
      }

      // Ordered list item: 1. item
      const orderedListMatch = line.match(/^(\d+)\.\s+(.*)$/);
      if (orderedListMatch) {
        result.push({
          type: 'ordered-list-item',
          index: orderedListMatch[1],
          content: this.parseInline(orderedListMatch[2])
        });
        if (i < lines.length - 1) result.push({ type: 'text', content: '\n' });
        continue;
      }

      const isLastLine = i === lines.length - 1;
      const content = line + (isLastLine ? '' : '\n');
      if (content) {
        result.push(...this.parseInline(content));
      }
    }
    return result;
  }

  private parseInline(text: string): MarkdownPart[] {
    let parts: MarkdownPart[] = [{ type: 'text', content: text }];

    // Inline code: `code`
    parts = this.splitByRegex(parts, /`([^`]+)`/g, (m) => ({ type: 'inline-code', content: m[1] }));

    // Bold: **bold** or __bold__
    parts = this.splitByRegex(parts, /(\*\*|__)(.*?)\1/g, (m) => ({ type: 'bold', content: m[2] }));

    // Italic: *italic* or _italic_
    parts = this.splitByRegex(parts, /(\*|_)(.*?)\1/g, (m) => ({ type: 'italic', content: m[2] }));

    return parts;
  }

  private splitByRegex(parts: MarkdownPart[], regex: RegExp, creator: (match: RegExpExecArray) => MarkdownPart): MarkdownPart[] {
    const result: MarkdownPart[] = [];
    for (const part of parts) {
      if (part.type !== 'text') {
        result.push(part);
        continue;
      }
      let lastIndex = 0;
      let match;
      const text = part.content as string;
      regex.lastIndex = 0;
      while ((match = regex.exec(text)) !== null) {
        const before = text.substring(lastIndex, match.index);
        if (before) result.push({ type: 'text', content: before });
        result.push(creator(match));
        lastIndex = regex.lastIndex;
      }
      const remaining = text.substring(lastIndex);
      if (remaining) result.push({ type: 'text', content: remaining });
    }
    return result;
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
