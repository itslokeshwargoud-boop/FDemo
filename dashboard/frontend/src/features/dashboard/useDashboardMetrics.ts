import { useQuery } from '@tanstack/react-query';
import { metricsApi } from '../../api';
import type { DashboardData } from '../../shared/types';

export function useDashboardMetrics(range: string = '7d') {
  return useQuery<DashboardData>({
    queryKey: ['dashboard', range],
    queryFn: () => metricsApi.getDashboard(range),
    staleTime: 60 * 1000, // 1 minute
    refetchInterval: 5 * 60 * 1000, // refetch every 5 minutes
    refetchOnWindowFocus: true,
    retry: 2,
  });
}
