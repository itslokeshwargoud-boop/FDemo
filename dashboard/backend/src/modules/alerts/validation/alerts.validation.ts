import { z } from 'zod';

export const alertsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['ACTIVE', 'ACKNOWLEDGED', 'RESOLVED']).optional(),
  severity: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO']).optional(),
});

export type AlertsQueryDto = z.infer<typeof alertsQuerySchema>;
