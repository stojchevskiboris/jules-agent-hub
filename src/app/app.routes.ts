import { Routes } from '@angular/router';
import { DashboardLayoutComponent } from './components/dashboard-layout/dashboard-layout.component';
import { TaskBoardComponent } from './components/task-board/task-board.component';
import { WorkspaceComponent } from './components/workspace/workspace.component';

export const routes: Routes = [
  {
    path: '',
    component: DashboardLayoutComponent,
    children: [
      { path: '', redirectTo: 'tasks', pathMatch: 'full' },
      { path: 'tasks', component: TaskBoardComponent },
      { path: 'workspace', component: WorkspaceComponent }
    ]
  }
];
