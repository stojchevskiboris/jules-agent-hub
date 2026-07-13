export enum SessionState {
  STATE_UNSPECIFIED = 'STATE_UNSPECIFIED',
  QUEUED = 'QUEUED',
  PLANNING = 'PLANNING',
  AWAITING_PLAN_APPROVAL = 'AWAITING_PLAN_APPROVAL',
  AWAITING_USER_FEEDBACK = 'AWAITING_USER_FEEDBACK',
  IN_PROGRESS = 'IN_PROGRESS',
  PAUSED = 'PAUSED',
  FAILED = 'FAILED',
  COMPLETED = 'COMPLETED'
}

export const SESSION_STATE_UI: Record<string, { name: string; class: string; description: string }> = {
  [SessionState.QUEUED]: {
    name: 'Queued',
    class: 'queued',
    description: 'Session is waiting to be processed'
  },
  [SessionState.PLANNING]: {
    name: 'Planning',
    class: 'planning',
    description: 'Jules is analyzing the task and creating a plan'
  },
  [SessionState.AWAITING_PLAN_APPROVAL]: {
    name: 'Awaiting Approval',
    class: 'awaiting-approval',
    description: 'Plan is ready and waiting for user approval'
  },
  [SessionState.AWAITING_USER_FEEDBACK]: {
    name: 'Awaiting Feedback',
    class: 'awaiting-feedback',
    description: 'Jules needs additional input from the user'
  },
  [SessionState.IN_PROGRESS]: {
    name: 'In Progress',
    class: 'in-progress',
    description: 'Jules is actively working on the task'
  },
  [SessionState.PAUSED]: {
    name: 'Paused',
    class: 'paused',
    description: 'Session is paused'
  },
  [SessionState.COMPLETED]: {
    name: 'Completed',
    class: 'completed',
    description: 'Task completed successfully'
  },
  [SessionState.FAILED]: {
    name: 'Failed',
    class: 'failed',
    description: 'Task failed to complete'
  },
  [SessionState.STATE_UNSPECIFIED]: {
    name: 'Unknown',
    class: 'unknown',
    description: 'Session state is unspecified'
  }
};

export function getSessionStateUI(state: SessionState | string | undefined) {
  if (!state) return SESSION_STATE_UI[SessionState.STATE_UNSPECIFIED];
  return SESSION_STATE_UI[state] || SESSION_STATE_UI[SessionState.STATE_UNSPECIFIED];
}

export enum AutomationMode {
  AUTOMATION_MODE_UNSPECIFIED = 'AUTOMATION_MODE_UNSPECIFIED',
  AUTO_CREATE_PR = 'AUTO_CREATE_PR'
}

export interface GitHubBranch {
  displayName: string;
}

export interface GitHubRepo {
  owner: string;
  repo: string;
  isPrivate: boolean;
  defaultBranch: GitHubBranch;
  branches?: GitHubBranch[];
}

export interface GitHubRepoContext {
  startingBranch: string;
}

export interface SourceContext {
  source: string;
  githubRepoContext?: GitHubRepoContext;
}

export interface Source {
  name: string;
  id: string;
  githubRepo: GitHubRepo;
}

export interface ListSourcesResponse {
  sources: Source[];
  nextPageToken?: string;
}

export interface PlanStep {
  id: string;
  index?: number;
  title: string;
  description: string;
}

export interface Plan {
  id: string;
  steps: PlanStep[];
  createTime: string;
}

export interface GitPatch {
  baseCommitId: string;
  unidiffPatch: string;
  suggestedCommitMessage: string;
}

export interface ChangeSet {
  source: string;
  gitPatch: GitPatch;
}

export interface BashOutput {
  command: string;
  output: string;
  exitCode: number;
}

export interface Media {
  mimeType: string;
  data: string;
}

export interface Artifact {
  changeSet?: ChangeSet;
  bashOutput?: BashOutput;
  media?: Media;
}

export interface PlanGenerated {
  plan: Plan;
}

export interface PlanApproved {
  planId: string;
}

export interface UserMessaged {
  userMessage: string;
}

export interface AgentMessaged {
  agentMessage: string;
}

export interface ProgressUpdated {
  title: string;
  description: string;
}

export interface SessionFailed {
  reason: string;
}

export interface Activity {
  name: string;
  id: string;
  originator: string;
  description: string;
  createTime: string;
  artifacts?: Artifact[];
  planGenerated?: PlanGenerated;
  planApproved?: PlanApproved;
  userMessaged?: UserMessaged;
  agentMessaged?: AgentMessaged;
  progressUpdated?: ProgressUpdated;
  sessionCompleted?: any;
  sessionFailed?: SessionFailed;
}

export interface ListActivitiesResponse {
  activities: Activity[];
  nextPageToken?: string;
}

export interface PullRequest {
  url: string;
  title: string;
  description: string;
  number?: number;
  merged?: boolean;
}

export interface SessionOutput {
  pullRequest?: PullRequest;
}

export interface Session {
  name: string;
  id: string;
  prompt: string;
  title?: string;
  state?: SessionState | string;
  url?: string;
  sourceContext: SourceContext;
  requirePlanApproval?: boolean;
  automationMode?: AutomationMode | string;
  outputs?: SessionOutput[];
  createTime?: string;
  updateTime?: string;
}

export interface ListSessionsResponse {
  sessions: Session[];
  nextPageToken?: string;
}

export interface SendMessageRequest {
  prompt: string;
}
