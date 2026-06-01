import { apiFetch } from './client';
import type { DashboardData, AlertItem } from '../shared/types';

// --- Metrics API ---
export const metricsApi = {
  getDashboard: (range: string = '7d') =>
    apiFetch<DashboardData>(`/api/v1/metrics/dashboard?range=${range}`),
};

// --- Alerts API ---
export const alertsApi = {
  getAlerts: (params: { page?: number; pageSize?: number; status?: string; severity?: string } = {}) => {
    const searchParams = new URLSearchParams();
    if (params.page) searchParams.set('page', String(params.page));
    if (params.pageSize) searchParams.set('pageSize', String(params.pageSize));
    if (params.status) searchParams.set('status', params.status);
    if (params.severity) searchParams.set('severity', params.severity);
    return apiFetch<AlertItem[]>(`/api/v1/alerts?${searchParams.toString()}`);
  },

  acknowledgeAlert: (id: string) =>
    apiFetch<AlertItem>(`/api/v1/alerts/${id}/acknowledge`, { method: 'PATCH' }),

  resolveAlert: (id: string) =>
    apiFetch<AlertItem>(`/api/v1/alerts/${id}/resolve`, { method: 'PATCH' }),
};
