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
