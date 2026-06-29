import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { JulesApiService } from '../../services/jules-api.service';
import { Source } from '../../models/jules.models';

@Component({
  selector: 'app-dashboard-layout',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './dashboard-layout.component.html',
  styleUrl: './dashboard-layout.component.scss'
})
export class DashboardLayoutComponent implements OnInit {
  private readonly apiService = inject(JulesApiService);
  private readonly router = inject(Router);

  sources = signal<Source[]>([]);
  loading = signal<boolean>(true);
  error = signal<string | null>(null);

  ngOnInit() {
    this.loadSources();
  }

  loadSources() {
    this.loading.set(true);
    this.apiService.getSources().subscribe({
      next: (res) => {
        this.sources.set(res.sources || []);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set('Failed to load repositories');
        this.loading.set(false);
        console.error(err);
      }
    });
  }

  selectSource(source: Source) {
    // Navigate to workspace with source as parameter
    this.router.navigate(['/workspace'], { queryParams: { source: source.name } });
  }

  setApiKey() {
    const key = prompt('Enter your Jules API Key:');
    if (key) {
      localStorage.setItem('JULES_API_KEY', key);
      window.location.reload();
    }
  }
}
