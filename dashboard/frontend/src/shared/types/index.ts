export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
    code: string;
  };
  meta?: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface User {
  id: string;
  email: string;
  name: string;
  createdAt?: string;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
}

export interface KpiValue {
  value: number;
  change: number;
}

export interface DashboardKpis {
  totalUsers: KpiValue;
  activeUsers: KpiValue;
  totalRevenue: KpiValue;
  conversionRate: KpiValue;
}

export interface TrendPoint {
  date: string;
  pageViews: number;
  sessions: number;
  bounceRate: number;
  avgSessionDuration: number;
}

export interface AlertItem {
  id: string;
  title: string;
  message: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  status: 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED';
  source: string;
  createdAt: string;
}

export interface DashboardData {
  kpis: DashboardKpis;
  trends: TrendPoint[];
  recentAlerts: AlertItem[];
  range: string;
  periodStart: string;
  periodEnd: string;
}
