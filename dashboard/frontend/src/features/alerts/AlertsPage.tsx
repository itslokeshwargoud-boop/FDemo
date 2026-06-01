import { useState } from 'react';
import { useAlerts } from './useAlerts';

const severityColors: Record<string, string> = {
  CRITICAL: '#DC2626',
  HIGH: '#F97316',
  MEDIUM: '#F59E0B',
  LOW: '#3B82F6',
  INFO: '#6B7280',
};

const severityBg: Record<string, string> = {
  CRITICAL: '#FEE2E2',
  HIGH: '#FFF7ED',
  MEDIUM: '#FFFBEB',
  LOW: '#EFF6FF',
  INFO: '#F3F4F6',
};

export function AlertsPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<string>('');
  const { data: alerts, isLoading, isError } = useAlerts({ page, pageSize: 20, status: status || undefined });

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <div style={styles.header}>
          <h2 style={styles.title}>Alerts</h2>
          <div style={styles.filters}>
            {['', 'ACTIVE', 'ACKNOWLEDGED', 'RESOLVED'].map((s) => (
              <button
                key={s}
                onClick={() => { setStatus(s); setPage(1); }}
                style={{
                  ...styles.filterBtn,
                  ...(status === s ? styles.filterBtnActive : {}),
                }}
              >
                {s || 'All'}
              </button>
            ))}
          </div>
        </div>

        {isLoading && <p style={styles.loading}>Loading alerts...</p>}
        {isError && <p style={styles.error}>Failed to load alerts</p>}

        {alerts && (
          <div style={styles.list}>
            {alerts.length === 0 && <p style={styles.empty}>No alerts found</p>}
            {alerts.map((alert) => (
              <div key={alert.id} style={styles.item}>
                <div style={styles.itemTop}>
                  <span
                    style={{
                      ...styles.badge,
                      backgroundColor: severityBg[alert.severity],
                      color: severityColors[alert.severity],
                    }}
                  >
                    {alert.severity}
                  </span>
                  <span style={{
                    ...styles.statusBadge,
                    color: alert.status === 'ACTIVE' ? '#DC2626' : alert.status === 'ACKNOWLEDGED' ? '#F59E0B' : '#10B981',
                  }}>
                    {alert.status}
                  </span>
                  <span style={styles.source}>{alert.source}</span>
                  <span style={styles.time}>{new Date(alert.createdAt).toLocaleString()}</span>
                </div>
                <div style={styles.alertTitle}>{alert.title}</div>
                <div style={styles.message}>{alert.message}</div>
              </div>
            ))}
          </div>
        )}

        <div style={styles.pagination}>
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            style={styles.pageBtn}
          >
            ← Previous
          </button>
          <span style={styles.pageInfo}>Page {page}</span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={!alerts || alerts.length < 20}
            style={styles.pageBtn}
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    padding: '1.5rem 2rem',
    maxWidth: '1200px',
    margin: '0 auto',
  },
  container: {},
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1.5rem',
  },
  title: {
    fontSize: '1.25rem',
    fontWeight: 600,
    color: '#111827',
    margin: 0,
  },
  filters: {
    display: 'flex',
    gap: '4px',
    background: '#F3F4F6',
    borderRadius: '8px',
    padding: '3px',
  },
  filterBtn: {
    padding: '6px 12px',
    borderRadius: '6px',
    border: 'none',
    background: 'transparent',
    fontSize: '0.75rem',
    fontWeight: 500,
    color: '#6B7280',
    cursor: 'pointer',
  },
  filterBtnActive: {
    background: '#fff',
    color: '#F97316',
    boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
  },
  loading: { color: '#6B7280', textAlign: 'center' as const, padding: '2rem' },
  error: { color: '#DC2626', textAlign: 'center' as const, padding: '2rem' },
  empty: { color: '#9CA3AF', textAlign: 'center' as const, padding: '2rem' },
  list: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.75rem',
  },
  item: {
    padding: '1rem',
    borderRadius: '12px',
    background: '#fff',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  },
  itemTop: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    marginBottom: '0.5rem',
  },
  badge: {
    fontSize: '0.625rem',
    fontWeight: 700,
    padding: '2px 6px',
    borderRadius: '4px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  },
  statusBadge: {
    fontSize: '0.625rem',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
  },
  source: {
    fontSize: '0.75rem',
    color: '#9CA3AF',
  },
  time: {
    fontSize: '0.75rem',
    color: '#9CA3AF',
    marginLeft: 'auto',
  },
  alertTitle: {
    fontSize: '0.9rem',
    fontWeight: 600,
    color: '#111827',
    marginBottom: '0.25rem',
  },
  message: {
    fontSize: '0.8rem',
    color: '#6B7280',
  },
  pagination: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: '1rem',
    marginTop: '1.5rem',
  },
  pageBtn: {
    padding: '6px 16px',
    borderRadius: '8px',
    border: '1px solid #E5E7EB',
    background: '#fff',
    fontSize: '0.8rem',
    color: '#6B7280',
    cursor: 'pointer',
  },
  pageInfo: {
    fontSize: '0.8rem',
    color: '#6B7280',
  },
};
