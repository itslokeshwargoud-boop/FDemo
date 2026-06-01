import { useState } from 'react';
import { useDashboardMetrics } from './useDashboardMetrics';
import { KpiCard } from './KpiCard';
import { TrendChart } from './TrendChart';
import { RecentAlerts } from './RecentAlerts';

const RANGES = [
  { label: '1D', value: '1d' },
  { label: '7D', value: '7d' },
  { label: '14D', value: '14d' },
  { label: '30D', value: '30d' },
  { label: '90D', value: '90d' },
];

export function DashboardPage() {
  const [range, setRange] = useState('7d');
  const { data, isLoading, isError, error } = useDashboardMetrics(range);

  return (
    <div style={styles.page}>
      {/* Header */}
      <header style={styles.header}>
        <div>
          <h1 style={styles.logo}>REPSCAN</h1>
        </div>
        <div style={styles.headerRight}>
          <div style={styles.rangePicker}>
            {RANGES.map((r) => (
              <button
                key={r.value}
                onClick={() => setRange(r.value)}
                style={{
                  ...styles.rangeBtn,
                  ...(range === r.value ? styles.rangeBtnActive : {}),
                }}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Content */}
      <main style={styles.main}>
        {isLoading && (
          <div style={styles.loadingContainer}>
            <div style={styles.spinner} />
            <p style={styles.loadingText}>Loading dashboard...</p>
          </div>
        )}

        {isError && (
          <div style={styles.errorBox}>
            <p>Failed to load dashboard data</p>
            <p style={styles.errorDetail}>{error instanceof Error ? error.message : 'Unknown error'}</p>
          </div>
        )}

        {data && (
          <>
            {/* KPI Cards */}
            <div style={styles.kpiGrid}>
              <KpiCard title="Total Users" kpi={data.kpis.totalUsers} icon="👥" />
              <KpiCard title="Active Users" kpi={data.kpis.activeUsers} icon="🟢" />
              <KpiCard title="Revenue" kpi={data.kpis.totalRevenue} format="currency" icon="💰" />
              <KpiCard title="Conversion" kpi={data.kpis.conversionRate} format="percent" icon="📈" />
            </div>

            {/* Chart + Alerts Grid */}
            <div style={styles.bottomGrid}>
              <div style={styles.chartCol}>
                <TrendChart data={data.trends} />
              </div>
              <div style={styles.alertsCol}>
                <RecentAlerts alerts={data.recentAlerts} />
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: '#FAFAFA',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '1rem 2rem',
    background: '#fff',
    borderBottom: '1px solid #F3F4F6',
  },
  logo: {
    fontSize: '1.25rem',
    fontWeight: 700,
    color: '#F97316',
    margin: 0,
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
  },
  rangePicker: {
    display: 'flex',
    gap: '4px',
    background: '#F3F4F6',
    borderRadius: '8px',
    padding: '3px',
  },
  rangeBtn: {
    padding: '6px 12px',
    borderRadius: '6px',
    border: 'none',
    background: 'transparent',
    fontSize: '0.75rem',
    fontWeight: 500,
    color: '#6B7280',
    cursor: 'pointer',
  },
  rangeBtnActive: {
    background: '#fff',
    color: '#F97316',
    boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
  },
  main: {
    padding: '1.5rem 2rem',
    maxWidth: '1400px',
    margin: '0 auto',
  },
  kpiGrid: {
    display: 'flex',
    gap: '1rem',
    flexWrap: 'wrap' as const,
    marginBottom: '1.5rem',
  },
  bottomGrid: {
    display: 'grid',
    gridTemplateColumns: '2fr 1fr',
    gap: '1.5rem',
  },
  chartCol: {},
  alertsCol: {},
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    padding: '4rem',
  },
  spinner: {
    width: '32px',
    height: '32px',
    border: '3px solid #F3F4F6',
    borderTopColor: '#F97316',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  loadingText: {
    marginTop: '1rem',
    color: '#6B7280',
    fontSize: '0.875rem',
  },
  errorBox: {
    padding: '1.5rem',
    borderRadius: '12px',
    background: '#FEE2E2',
    color: '#DC2626',
    textAlign: 'center' as const,
  },
  errorDetail: {
    fontSize: '0.8rem',
    marginTop: '0.25rem',
    opacity: 0.7,
  },
};
