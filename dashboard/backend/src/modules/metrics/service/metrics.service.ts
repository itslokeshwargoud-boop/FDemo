import { MetricsRepository } from '../repository/metrics.repository';
import { prisma } from '../../../config/database';

interface RangeMap {
  [key: string]: number;
}

const RANGE_DAYS: RangeMap = {
  '1d': 1,
  '7d': 7,
  '14d': 14,
  '30d': 30,
  '90d': 90,
};

export class MetricsService {
  constructor(private readonly metricsRepo: MetricsRepository) {}

  async getDashboardMetrics(range: string) {
    const days = RANGE_DAYS[range] || 7;

    const endDate = new Date();
    endDate.setHours(23, 59, 59, 999);

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    const [snapshots, recentAlerts] = await Promise.all([
      this.metricsRepo.getSnapshotsInRange(startDate, endDate),
      prisma.alert.findMany({
        where: { status: 'ACTIVE' },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    ]);

    // Calculate KPI totals from latest snapshot
    const latest = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;
    const previous = snapshots.length > 1 ? snapshots[snapshots.length - 2] : null;

    const kpis = {
      totalUsers: {
        value: latest?.totalUsers ?? 0,
        change: this.calcChange(latest?.totalUsers, previous?.totalUsers),
      },
      activeUsers: {
        value: latest?.activeUsers ?? 0,
        change: this.calcChange(latest?.activeUsers, previous?.activeUsers),
      },
      totalRevenue: {
        value: Math.round((latest?.totalRevenue ?? 0) * 100) / 100,
        change: this.calcChange(latest?.totalRevenue, previous?.totalRevenue),
      },
      conversionRate: {
        value: Math.round((latest?.conversionRate ?? 0) * 100) / 100,
        change: this.calcChange(latest?.conversionRate, previous?.conversionRate),
      },
    };

    // Time-series trend data
    const trends = snapshots.map((s) => ({
      date: s.date.toISOString().split('T')[0],
      pageViews: s.pageViews,
      sessions: s.sessions,
      bounceRate: Math.round(s.bounceRate * 100) / 100,
      avgSessionDuration: Math.round(s.avgSessionDuration),
    }));

    return {
      kpis,
      trends,
      recentAlerts: recentAlerts.map((a) => ({
        id: a.id,
        title: a.title,
        message: a.message,
        severity: a.severity,
        status: a.status,
        source: a.source,
        createdAt: a.createdAt,
      })),
      range,
      periodStart: startDate.toISOString(),
      periodEnd: endDate.toISOString(),
    };
  }

  private calcChange(current?: number | null, previous?: number | null): number {
    if (!current || !previous || previous === 0) return 0;
    return Math.round(((current - previous) / previous) * 10000) / 100;
  }
}
