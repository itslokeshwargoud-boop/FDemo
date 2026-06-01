import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import type { TrendPoint } from '../../shared/types';

interface TrendChartProps {
  data: TrendPoint[];
}

export function TrendChart({ data }: TrendChartProps) {
  return (
    <div style={styles.card}>
      <h3 style={styles.title}>Traffic Trends</h3>
      <div style={{ width: '100%', height: 300 }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 12, fill: '#9CA3AF' }}
              tickFormatter={(v: string) => {
                const d = new Date(v);
                return `${d.getMonth() + 1}/${d.getDate()}`;
              }}
            />
            <YAxis tick={{ fontSize: 12, fill: '#9CA3AF' }} />
            <Tooltip
              contentStyle={{
                borderRadius: '8px',
                border: '1px solid #E5E7EB',
                boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
              }}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="pageViews"
              name="Page Views"
              stroke="#F97316"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
            <Line
              type="monotone"
              dataKey="sessions"
              name="Sessions"
              stroke="#8B5CF6"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
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
};
