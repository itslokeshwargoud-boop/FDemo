import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { AlertsPage } from './features/alerts/AlertsPage';
import type { ReactNode } from 'react';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      retry: 2,
      refetchOnWindowFocus: true,
    },
  },
});

function AppLayout({ children }: { children: ReactNode }) {
  const location = useLocation();

  const navItems = [
    { path: '/', label: 'Dashboard' },
    { path: '/alerts', label: 'Alerts' },
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#FAFAFA' }}>
      <nav style={navStyles.nav}>
        {navItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            style={{
              ...navStyles.link,
              ...(location.pathname === item.path ? navStyles.linkActive : {}),
            }}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}

const navStyles: Record<string, React.CSSProperties> = {
  nav: {
    display: 'flex',
    gap: '0.25rem',
    padding: '0 2rem',
    background: '#fff',
    borderBottom: '1px solid #F3F4F6',
  },
  link: {
    padding: '0.75rem 1rem',
    fontSize: '0.8rem',
    fontWeight: 500,
    color: '#6B7280',
    textDecoration: 'none',
    borderBottom: '2px solid transparent',
    transition: 'color 0.15s, border-color 0.15s',
  },
  linkActive: {
    color: '#F97316',
    borderBottomColor: '#F97316',
  },
};

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppLayout>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/alerts" element={<AlertsPage />} />
            {/* Redirect /login and anything else straight to dashboard */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AppLayout>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
