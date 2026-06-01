import type { AlertItem } from '../../shared/types';

interface RecentAlertsProps {
  alerts: AlertItem[];
}

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

export function RecentAlerts({ alerts }: RecentAlertsProps) {
  if (!alerts.length) {
    return (
      <div style={styles.card}>
        <h3 style={styles.title}>Recent Alerts</h3>
        <p style={styles.empty}>No active alerts</p>
      </div>
    );
  }

  return (
    <div style={styles.card}>
      <h3 style={styles.title}>Recent Alerts</h3>
      <div style={styles.list}>
        {alerts.map((alert) => (
          <div key={alert.id} style={styles.item}>
            <div style={styles.itemHeader}>
              <span
                style={{
                  ...styles.badge,
                  backgroundColor: severityBg[alert.severity],
                  color: severityColors[alert.severity],
                }}
              >
                {alert.severity}
              </span>
              <span style={styles.source}>{alert.source}</span>
              <span style={styles.time}>
                {new Date(alert.createdAt).toLocaleDateString()}
              </span>
            </div>
            <div style={styles.alertTitle}>{alert.title}</div>
            <div style={styles.message}>{alert.message}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    background: '#fff',
    borderRadius: '12px',
    padding: '1.25rem',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  },
  title: {
    fontSize: '1rem',
    fontWeight: 600,
    color: '#374151',
    marginBottom: '1rem',
  },
  empty: {
    color: '#9CA3AF',
    fontSize: '0.875rem',
    textAlign: 'center' as const,
    padding: '2rem 0',
  },
  list: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.75rem',
  },
  item: {
    padding: '0.75rem',
    borderRadius: '8px',
    border: '1px solid #F3F4F6',
    transition: 'background 0.15s',
  },
  itemHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    marginBottom: '0.375rem',
  },
  badge: {
    fontSize: '0.625rem',
    fontWeight: 700,
    padding: '2px 6px',
    borderRadius: '4px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
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
    fontSize: '0.875rem',
    fontWeight: 600,
    color: '#111827',
    marginBottom: '0.125rem',
  },
  message: {
    fontSize: '0.8rem',
    color: '#6B7280',
  },
};
