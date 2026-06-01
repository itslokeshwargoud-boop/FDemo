import { useQuery } from '@tanstack/react-query';
import { alertsApi } from '../../api';
import type { AlertItem } from '../../shared/types';

export function useAlerts(params: { page?: number; pageSize?: number; status?: string; severity?: string } = {}) {
  return useQuery<AlertItem[]>({
    queryKey: ['alerts', params],
    queryFn: () => alertsApi.getAlerts(params),
    staleTime: 30 * 1000, // 30 seconds
    refetchOnWindowFocus: true,
    retry: 2,
  });
}
