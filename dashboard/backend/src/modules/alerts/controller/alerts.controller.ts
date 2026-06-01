import { Request, Response } from 'express';
import { AlertsService } from '../service/alerts.service';
import { asyncHandler, sendSuccess, sendPaginated } from '../../../shared/utils';

export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  getAlerts = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const query = {
      page: parseInt(req.query.page as string) || 1,
      pageSize: parseInt(req.query.pageSize as string) || 20,
      status: req.query.status as string | undefined,
      severity: req.query.severity as string | undefined,
    };
    const result = await this.alertsService.getAlerts(query as any);
    sendPaginated(res, result.alerts, {
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
    });
  });

  getAlert = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const alert = await this.alertsService.getAlertById(req.params.id as string);
    sendSuccess(res, alert);
  });

  acknowledgeAlert = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const alert = await this.alertsService.acknowledgeAlert(req.params.id as string);
    sendSuccess(res, alert);
  });

  resolveAlert = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const alert = await this.alertsService.resolveAlert(req.params.id as string);
    sendSuccess(res, alert);
  });
}
