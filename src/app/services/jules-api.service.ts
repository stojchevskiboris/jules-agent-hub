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

  getSources(): Observable<ListSourcesResponse> {
    return this.http.get<ListSourcesResponse>(`${this.baseUrl}/sources`);
  }

  getSessions(): Observable<ListSessionsResponse> {
    return this.http.get<ListSessionsResponse>(`${this.baseUrl}/sessions`);
  }

  createSession(sourceName: string, prompt: string, automationMode: string = 'AUTOMATION_MODE_UNSPECIFIED', startingBranch: string = 'main'): Observable<Session> {
    return this.http.post<Session>(`${this.baseUrl}/sessions`, {
      prompt,
      sourceContext: {
        source: sourceName,
        githubRepoContext: {
          startingBranch
        }
      },
      automationMode
    });
  }

  getSession(sessionId: string): Observable<Session> {
    return this.http.get<Session>(`${this.baseUrl}/${sessionId}`);
  }

  getSessionActivities(sessionId: string): Observable<ListActivitiesResponse> {
    // sessionId should be in format 'sessions/{id}'
    return this.http.get<ListActivitiesResponse>(`${this.baseUrl}/${sessionId}/activities`);
  }

  sendMessage(sessionId: string, prompt: string): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/${sessionId}:sendMessage`, {
      prompt
    });
  }

  approvePlan(sessionId: string): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/${sessionId}:approvePlan`, {});
  }

  pollSessionActivities(sessionId: string, intervalMs: number = 5000): Observable<ListActivitiesResponse> {
    return interval(intervalMs).pipe(
      startWith(0),
      switchMap(() => this.getSessionActivities(sessionId))
    );
  }
}
