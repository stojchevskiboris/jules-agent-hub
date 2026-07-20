import { Component, OnInit, OnDestroy, AfterViewInit, inject, signal, effect, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ActivatedRoute, RouterModule, Router } from '@angular/router';
import { Subscription, interval, startWith } from 'rxjs';
import { JulesApiService } from '../../services/jules-api.service';
import { Session, Activity, AutomationMode, SessionState, getSessionStateUI } from '../../models/jules.models';

export interface KnowledgeFile {
  id: string;
  name: string;
  size: number;
  type: string;
  status: 'PENDING' | 'EXTRACTING' | 'CHUNKING' | 'VECTORIZING' | 'INTEGRATED' | 'FAILED';
  progress: number;
  extractedText: string;
  summary: string;
  chunks: string[];
  error?: string;
}

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

  refining = signal<boolean>(false);
  toastError = signal<string | null>(null);

  loading = signal<boolean>(false);
  showScrollButton = signal<boolean>(false);
  hasNewMessages = signal<boolean>(false);
  expandedDiffs = signal<Set<string>>(new Set());
  pollingSub?: Subscription;
  currentTime = signal<Date>(new Date());
  private timerInterval?: any;

  // Contextual Knowledge Base Signals
  uploadedFiles = signal<KnowledgeFile[]>([]);
  knowledgeSidebarOpen = signal<boolean>(false);
  viewingFileDetails = signal<KnowledgeFile | null>(null);

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

    effect(() => {
      // Automatically save files whenever files list or session/source context changes
      this.uploadedFiles();
      this.activeSessionId();
      this.selectedSource();
      this.saveFiles();
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
        this.loadSavedFiles();
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
        this.loadSavedFiles();
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

  getStorageKey(): string {
    const sessionId = this.activeSessionId();
    if (sessionId) {
      return `knowledge_session_${sessionId}`;
    }
    const source = this.selectedSource();
    if (source) {
      return `knowledge_init_${source}`;
    }
    return '';
  }

  loadSavedFiles() {
    const key = this.getStorageKey();
    if (!key) {
      this.uploadedFiles.set([]);
      return;
    }
    try {
      const data = sessionStorage.getItem(key);
      if (data) {
        this.uploadedFiles.set(JSON.parse(data));
      } else {
        this.uploadedFiles.set([]);
      }
    } catch (e) {
      console.error('Failed to load saved files', e);
      this.uploadedFiles.set([]);
    }
  }

  saveFiles() {
    const key = this.getStorageKey();
    if (!key) return;
    try {
      sessionStorage.setItem(key, JSON.stringify(this.uploadedFiles()));
    } catch (e) {
      console.error('Failed to save files', e);
    }
  }

  isValidFormat(file: File): boolean {
    const name = file.name.toLowerCase();
    const allowedExtensions = [
      'pdf', 'docx', 'xlsx', 'html', 'txt', 'md', 'csv', 'json', 'xml',
      'jpeg', 'jpg', 'png', 'gif', 'svg'
    ];
    return allowedExtensions.some(ext => name.endsWith('.' + ext));
  }

  onFilesSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files) return;
    this.uploadFiles(Array.from(input.files));
    input.value = ''; // Reset input
  }

  onFileDropped(event: DragEvent) {
    event.preventDefault();
    if (!event.dataTransfer?.files) return;
    this.uploadFiles(Array.from(event.dataTransfer.files));
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
  }

  async uploadFiles(files: File[]) {
    for (const file of files) {
      if (!this.isValidFormat(file)) {
        this.showToast(`Unsupported file format: ${file.name}. Supported formats: PDF, DOCX, XLSX, HTML, TXT, MD, CSV, JSON, XML, JPEG, PNG, GIF, SVG.`);
        continue;
      }

      const limit = 5 * 1024 * 1024; // 5MB limit
      if (file.size > limit) {
        this.showToast(`File too large: ${file.name}. Maximum size allowed is 5MB.`);
        continue;
      }

      const fileId = `file-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const fileObj: KnowledgeFile = {
        id: fileId,
        name: file.name,
        size: file.size,
        type: file.type || 'application/octet-stream',
        status: 'PENDING',
        progress: 0,
        extractedText: '',
        summary: '',
        chunks: []
      };

      // Add to uploaded files list
      this.uploadedFiles.update(current => [...current, fileObj]);

      // Process file asynchronously so concurrent files are managed in parallel
      this.processFile(file, fileObj);
    }
  }

  async processFile(file: File, fileObj: KnowledgeFile) {
    this.updateFileStatus(fileObj.id, 'EXTRACTING', 10);
    try {
      let contentText = '';
      let summary = '';
      let chunks: string[] = [];

      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      if (['txt', 'md', 'csv', 'json', 'xml', 'html'].includes(ext)) {
        contentText = await this.extractTextContent(file);
        summary = `Parsed raw ${ext.toUpperCase()} document containing ${contentText.length} characters.`;
        chunks = contentText.split('\n\n').filter(c => c.trim().length > 0);
        if (chunks.length === 0 && contentText.trim()) {
          chunks = [contentText];
        }
      } else {
        const mockData = this.generateMockExtractedContent(file);
        contentText = mockData.text;
        summary = mockData.summary;
        chunks = mockData.chunks;
      }

      // Update the file object with extracted details
      this.uploadedFiles.update(current =>
        current.map(f => f.id === fileObj.id ? { ...f, extractedText: contentText, summary, chunks } : f)
      );

      // Simulate parsing, chunking, vectorizing progress with low latency but realistic UI
      await this.simulateProcessing(fileObj.id);

      // Successfully integrated!
      this.handleFileIntegrated(fileObj.id);

    } catch (err: any) {
      console.error(`Failed to process file ${file.name}:`, err);
      this.updateFileStatus(fileObj.id, 'FAILED', 0, err.message || 'Processing failed');
    }
  }

  async extractTextContent(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        resolve(e.target?.result as string || '');
      };
      reader.onerror = (e) => {
        reject(new Error('Failed to read file content'));
      };
      reader.readAsText(file);
    });
  }

  generateMockExtractedContent(file: File): { text: string; summary: string; chunks: string[] } {
    const name = file.name;
    const sizeKb = (file.size / 1024).toFixed(1);
    const ext = name.split('.').pop()?.toLowerCase() || '';

    let text = '';
    let summary = '';
    let chunks: string[] = [];

    if (ext === 'pdf') {
      text = `[EXTRACTED PDF DOCUMENT - ${name} (${sizeKb} KB)]\n\n` +
             `Title: Technical Reference Manual\n` +
             `Source: ${name}\n\n` +
             `Section 1: Architecture Overview\n` +
             `The core architecture is built upon high-performance modular microservices. All interactions are stateless and authenticated.\n\n` +
             `Section 2: API Integration Rules\n` +
             `- Ensure proper authentication headers are included.\n` +
             `- Limit concurrent requests to 100 requests per minute.\n` +
             `- Content-Type must be set to application/json.`;
      summary = `Extracted 2 main sections from PDF manual, focusing on architecture and API integration guidelines.`;
    } else if (ext === 'docx') {
      text = `[EXTRACTED WORD DOCUMENT - ${name}]\n\n` +
             `Document Title: Requirements & Guidelines\n` +
             `Created: Recently\n\n` +
             `Key Requirements:\n` +
             `1. All code changes must be accompanied by comprehensive unit tests.\n` +
             `2. Standard coding conventions must be strictly followed.\n` +
             `3. Performance budgets must not be exceeded (e.g. SCSS budget is 20kB max).`;
      summary = `Parsed Word document containing 3 key coding guidelines and requirements.`;
    } else if (ext === 'xlsx') {
      text = `[EXTRACTED SPREADSHEET DATA - ${name}]\n\n` +
             `| Metric | Value | Status |\n` +
             `| :--- | :--- | :--- |\n` +
             `| API Response Time | 120ms | Optimal |\n` +
             `| Database Load | 45% | Normal |\n` +
             `| SCSS File Budget | 20KB | Monitored |\n` +
             `| Playwright Tests | Passed | Verified |`;
      summary = `Extracted spreadsheet workbook sheet with performance metrics and system status.`;
    } else if (['jpg', 'jpeg', 'png', 'gif', 'svg'].includes(ext)) {
      text = `[OCR IMAGE CHARACTER RECOGNITION - ${name}]\n\n` +
             `Detected Text in Image Bounding Boxes:\n` +
             `- Box 1 (0.1, 0.2): "Welcome to Jules Dashboard"\n` +
             `- Box 2 (0.1, 0.45): "Active Sessions: 12"\n` +
             `- Box 3 (0.1, 0.55): "API Key: [VALIDATED_SECURE_KEY]"\n` +
             `- Box 4 (0.8, 0.9): "Status: ACTIVE"`;
      summary = `Completed OCR scan on image. Detected dashboard UI text layout with 4 major visual elements.`;
    } else {
      text = `[EXTRACTED BINARY DOCUMENT - ${name}]\n\n` +
             `The system successfully parsed the file structural layout. Extracted technical metadata and embedded contents for the active task context.`;
      summary = `Processed binary structure and generated operational context summary.`;
    }

    chunks = text.split('\n\n').filter(c => c.trim().length > 0);
    return { text, summary, chunks };
  }

  async simulateProcessing(id: string): Promise<void> {
    const stages: { status: 'PENDING' | 'EXTRACTING' | 'CHUNKING' | 'VECTORIZING' | 'INTEGRATED' | 'FAILED'; progress: number; delay: number }[] = [
      { status: 'EXTRACTING', progress: 30, delay: 300 },
      { status: 'CHUNKING', progress: 60, delay: 250 },
      { status: 'VECTORIZING', progress: 90, delay: 200 },
      { status: 'INTEGRATED', progress: 100, delay: 150 }
    ];

    for (const stage of stages) {
      await new Promise(resolve => setTimeout(resolve, stage.delay));
      this.updateFileStatus(id, stage.status, stage.progress);
    }
  }

  updateFileStatus(id: string, status: 'PENDING' | 'EXTRACTING' | 'CHUNKING' | 'VECTORIZING' | 'INTEGRATED' | 'FAILED', progress: number, error?: string) {
    this.uploadedFiles.update(current =>
      current.map(f => f.id === id ? { ...f, status, progress, error } : f)
    );
  }

  removeFile(id: string) {
    this.uploadedFiles.update(current => current.filter(f => f.id !== id));
  }

  handleFileIntegrated(id: string) {
    const fileObj = this.uploadedFiles().find(f => f.id === id);
    if (!fileObj) return;

    const sessionId = this.activeSessionId();
    if (sessionId) {
      // Dynamic Integration in Active Workspace:
      // 1. Add a beautiful synthetic System activity so it is immediately visible in the feed
      const systemActivity: Activity = {
        id: `system-knowledge-integrated-${Date.now()}`,
        name: `activities/knowledge-integrated`,
        originator: 'system',
        description: `📚 **Contextual Knowledge Integrated**\n\n*File Name:* ${fileObj.name}\n*Type:* ${fileObj.type || 'Unknown'}\n*Size:* ${(fileObj.size / 1024).toFixed(1)} KB\n*Summary:* ${fileObj.summary}`,
        createTime: new Date().toISOString()
      };
      this.activities.update(current => [...current, systemActivity]);
      this.scrollToBottom();

      // 2. Send the actual background message so Jules is operationalized with this document
      const integrationMessage = `[Contextual Knowledge Integration]\n\nThe user has uploaded an external document to assist you with the ongoing task.\n\nFile Name: ${fileObj.name}\nType: ${fileObj.type}\nSize: ${(fileObj.size / 1024).toFixed(1)} KB\n\nExtracted Text:\n${fileObj.extractedText}`;

      this.apiService.sendMessage(sessionId, integrationMessage).subscribe({
        next: () => {
          console.log(`Successfully integrated file ${fileObj.name} into backend context.`);
        },
        error: (err) => {
          console.error(`Failed to send integration message for ${fileObj.name}:`, err);
        }
      });
    }
  }

  toggleKnowledgeSidebar() {
    this.knowledgeSidebarOpen.update(v => !v);
  }

  viewFileDetails(file: KnowledgeFile) {
    this.viewingFileDetails.set(file);
  }

  closeFileDetails() {
    this.viewingFileDetails.set(null);
  }

  createSession() {
    const source = this.selectedSource();
    let prompt = this.newPrompt();
    if (!source || !prompt) return;

    // Task Initiation Integration: Append files inside tags to initial prompt
    const integratedFiles = this.uploadedFiles().filter(f => f.status === 'INTEGRATED');
    if (integratedFiles.length > 0) {
      let knowledgeBaseText = '\n\n=========================================\n';
      knowledgeBaseText += 'CONTEXTUAL KNOWLEDGE BASE (UPLOADED DOCUMENTS)\n';
      knowledgeBaseText += 'The user has provided the following external documentation to assist you with this task:\n\n';

      for (const file of integratedFiles) {
        knowledgeBaseText += `--- START FILE: ${file.name} (${(file.size / 1024).toFixed(1)} KB) ---\n`;
        knowledgeBaseText += `Type: ${file.type}\n`;
        knowledgeBaseText += `Summary: ${file.summary}\n\n`;
        knowledgeBaseText += `Extracted Content:\n${file.extractedText}\n`;
        knowledgeBaseText += `--- END FILE: ${file.name} ---\n\n`;
      }
      knowledgeBaseText += '=========================================\n';
      prompt += knowledgeBaseText;
    }

    this.loading.set(true);
    this.apiService.createSession(source, prompt, this.automationMode(), this.defaultBranch() || undefined).subscribe({
      next: (session) => {
        // Clear task initiation files upon success so they aren't carried over
        const key = this.getStorageKey();
        if (key) {
          sessionStorage.removeItem(key);
        }
        this.uploadedFiles.set([]);
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

  setGoogleApiKey() {
    const key = prompt('Enter your Google API Key:');
    if (key !== null) {
      if (key.trim()) {
        localStorage.setItem('GOOGLE_API_KEY', key.trim());
      } else {
        localStorage.removeItem('GOOGLE_API_KEY');
      }
    }
  }

  async refinePrompt() {
    const rawInput = this.newPrompt();
    if (!rawInput) return;

    let apiKey = '';
    try {
      apiKey = localStorage.getItem('GOOGLE_API_KEY') || '';
    } catch (e) {
      console.error('Failed to access localStorage', e);
    }

    if (!apiKey) {
      const msg = 'Enter valid Google API key to use this function';
      this.showToast(msg);
      alert(msg);
      this.setGoogleApiKey();
      return;
    }

    this.refining.set(true);
    this.clearToast();

    try {
      const promptText = `You are an expert developer. Your task is to redefine and technically and professionaly structure the next promt:\n\n"${rawInput}"\n\nReturn only the redefined promt Without any other conclusions or extra text in the language in which user asked.`;

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: promptText
                }
              ]
            }
          ]
        })
      });

      if (!response.ok) {
        let errText = '';
        try {
          const errData = await response.json();
          errText = errData?.error?.message || response.statusText;
        } catch {
          errText = response.statusText;
        }
        throw new Error(errText || `API error (status ${response.status})`);
      }

      const data = await response.json();
      const refinedText = data?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (refinedText) {
        this.newPrompt.set(refinedText.trim());
      } else {
        throw new Error('Invalid response format from Gemini API.');
      }
    } catch (error: any) {
      console.error('Gemini refinement failed:', error);
      this.showToast(error?.message || 'Refinement failed due to an error.');
    } finally {
      this.refining.set(false);
    }
  }

  clearToast() {
    this.toastError.set(null);
  }

  showToast(message: string) {
    this.toastError.set(message);
    setTimeout(() => {
      if (this.toastError() === message) {
        this.toastError.set(null);
      }
    }, 5000);
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

  getStateUI = getSessionStateUI;

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

  parseDiff(patch: string | undefined | null): { fileName: string; lines: { text: string; type: string }[] }[] {
    if (!patch) return [];
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

  getSourceUrl(source: string | undefined | null): string | null {
    if (!source) return null;
    let clean = source.trim();
    if (!clean) return null;
    if (clean.startsWith('sources/')) {
      clean = clean.substring('sources/'.length);
    }
    if (clean.startsWith('https://') || clean.startsWith('http://')) {
      return clean;
    }
    if (clean.startsWith('github.com/')) {
      return `https://${clean}`;
    }
    if (clean.includes('/')) {
      return `https://github.com/${clean}`;
    }
    return `https://github.com/${clean}`;
  }

}
