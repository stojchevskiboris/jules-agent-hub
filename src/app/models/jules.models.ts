export interface Source {
  name: string;
  displayName?: string;
  repositoryUrl?: string;
}

export interface ListSourcesResponse {
  sources: Source[];
  nextPageToken?: string;
}

export interface Session {
  name: string; // format: sessions/{id}
  source: string;
  instruction: string;
  automationMode?: 'AUTO_CREATE_PR' | 'NONE';
  state?: 'OPEN' | 'CLOSED' | string;
  outputs?: {
    pullRequest?: {
      url: string;
      number: number;
    };
  };
  createTime?: string;
  updateTime?: string;
}

export interface ListSessionsResponse {
  sessions: Session[];
  nextPageToken?: string;
}

export interface Activity {
  name: string; // format: sessions/{id}/activities/{activityId}
  type?: string;
  text?: string;
  createTime: string;
}

export interface ListActivitiesResponse {
  activities: Activity[];
  nextPageToken?: string;
}

export interface SendMessageRequest {
  message: string;
}
