import { z } from 'zod';

export const dashboardQuerySchema = z.object({
  range: z.enum(['1d', '7d', '14d', '30d', '90d']).default('7d'),
});

export type DashboardQueryDto = z.infer<typeof dashboardQuerySchema>;
