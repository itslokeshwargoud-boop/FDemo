import type { KpiValue } from '../../shared/types';

interface KpiCardProps {
  title: string;
  kpi: KpiValue;
  format?: 'number' | 'currency' | 'percent';
  icon: string;
}

function formatValue(value: number, format: string): string {
  switch (format) {
    case 'currency':
      return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    case 'percent':
      return `${value.toFixed(2)}%`;
    default:
      return value.toLocaleString();
  }
}

export function KpiCard({ title, kpi, format = 'number', icon }: KpiCardProps) {
  const isPositive = kpi.change >= 0;

  return (
    <div style={styles.card}>
      <div style={styles.header}>
        <span style={styles.icon}>{icon}</span>
        <span style={styles.title}>{title}</span>
      </div>
      <div style={styles.value}>{formatValue(kpi.value, format)}</div>
      <div style={{ ...styles.change, color: isPositive ? '#10B981' : '#EF4444' }}>
        {isPositive ? '↑' : '↓'} {Math.abs(kpi.change).toFixed(2)}%
        <span style={styles.changeLabel}> vs previous</span>
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
    flex: '1 1 200px',
    minWidth: '200px',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    marginBottom: '0.75rem',
  },
  icon: {
    fontSize: '1.25rem',
  },
  title: {
    fontSize: '0.8rem',
    fontWeight: 500,
    color: '#6B7280',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  },
  value: {
    fontSize: '1.75rem',
    fontWeight: 700,
    color: '#111827',
    marginBottom: '0.25rem',
  },
  change: {
    fontSize: '0.8rem',
    fontWeight: 600,
  },
  changeLabel: {
    fontWeight: 400,
    color: '#9CA3AF',
  },
};
