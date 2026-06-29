export interface Source {
  name: string;
  displayName?: string;
  repositoryUrl?: string;
  githubRepo?: any;
}

export interface ListSourcesResponse {
  sources: Source[];
  nextPageToken?: string;
}

export interface Session {
  name: string; // format: sessions/{id}
  title?: string;
  source: string;
  instruction: string;
  automationMode?: 'AUTO_CREATE_PR' | 'NONE';
  state?: 'OPEN' | 'CLOSED' | 'ACTIVE' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | string;
  outputs?: {
    pullRequest?: {
      url: string;
      number: number;
      title?: string;
      description?: string;
      baseRef?: string;
      headRef?: string;
    };
    changeSet?: {
      source: string;
      gitPatch: {
        unidiffPatch: string;
        baseCommitId: string;
        suggestedCommitMessage: string;
      };
    };
  };
  createTime?: string;
  updateTime?: string;
  prompt?: string;
  url?: string;
  id?: string;
}

export interface ListSessionsResponse {
  sessions: Session[];
  nextPageToken?: string;
}

export interface Activity {
  name: string; // format: sessions/{id}/activities/{activityId}
  createTime: string;
  originator?: string;
}

export interface ListActivitiesResponse {
  activities: Activity[];
  nextPageToken?: string;
}

export interface SendMessageRequest {
  message: string;
}
