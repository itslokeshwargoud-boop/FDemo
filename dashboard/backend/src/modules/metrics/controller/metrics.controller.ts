import { Request, Response } from 'express';
import { MetricsService } from '../service/metrics.service';
import { asyncHandler, sendSuccess } from '../../../shared/utils';

export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  getDashboard = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const range = (req.query.range as string) || '7d';
    const data = await this.metricsService.getDashboardMetrics(range);
    sendSuccess(res, data);
  });
}
