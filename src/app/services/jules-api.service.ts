import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, interval, switchMap, startWith } from 'rxjs';
import {
  Source, ListSourcesResponse,
  Session, ListSessionsResponse,
  Activity, ListActivitiesResponse,
  SendMessageRequest
} from '../models/jules.models';

@Injectable({
  providedIn: 'root'
})
export class JulesApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = 'https://jules.googleapis.com/v1alpha';

  getSources(pageToken?: string): Observable<ListSourcesResponse> {
    const url = pageToken ? `${this.baseUrl}/sources?pageToken=${pageToken}` : `${this.baseUrl}/sources`;
    return this.http.get<ListSourcesResponse>(url);
  }

  getSessions(): Observable<ListSessionsResponse> {
    return this.http.get<ListSessionsResponse>(`${this.baseUrl}/sessions`);
  }

  createSession(sourceName: string, prompt: string, automationMode: string = 'AUTOMATION_MODE_UNSPECIFIED', startingBranch?: string): Observable<Session> {
    const body: any = {
      prompt,
      sourceContext: {
        source: sourceName
      },
      automationMode
    };

    if (startingBranch) {
      body.sourceContext.githubRepoContext = { startingBranch };
    }

    return this.http.post<Session>(`${this.baseUrl}/sessions`, body);
  }

  getSession(sessionId: string): Observable<Session> {
    return this.http.get<Session>(`${this.baseUrl}/${sessionId}`);
  }

  getSessionActivities(sessionId: string, pageToken?: string): Observable<ListActivitiesResponse> {
    // sessionId should be in format 'sessions/{id}'
    let url = `${this.baseUrl}/${sessionId}/activities`;
    if (pageToken) {
      url += `?pageToken=${pageToken}`;
    }
    return this.http.get<ListActivitiesResponse>(url);
  }

  sendMessage(sessionId: string, prompt: string): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/${sessionId}:sendMessage`, {
      prompt
    });
  }

  approvePlan(sessionId: string): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/${sessionId}:approvePlan`, {});
  }

  pollSessionActivities(sessionId: string, getPageToken: () => string | undefined, intervalMs: number = 5000): Observable<ListActivitiesResponse> {
    return interval(intervalMs).pipe(
      startWith(0),
      switchMap(() => this.getSessionActivities(sessionId, getPageToken()))
    );
  }
}
