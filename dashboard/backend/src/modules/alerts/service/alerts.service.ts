import { AlertsRepository } from '../repository/alerts.repository';
import { AlertsQueryDto } from '../validation/alerts.validation';
import { NotFoundError } from '../../../shared/errors';
import { Prisma } from '@prisma/client';

export class AlertsService {
  constructor(private readonly alertsRepo: AlertsRepository) {}

  async getAlerts(query: AlertsQueryDto) {
    const where: Prisma.AlertWhereInput = {};

    if (query.status) where.status = query.status;
    if (query.severity) where.severity = query.severity;

    const skip = (query.page - 1) * query.pageSize;

    const { data, total } = await this.alertsRepo.findMany({
      skip,
      take: query.pageSize,
      where,
    });

    return {
      alerts: data.map((a) => ({
        id: a.id,
        title: a.title,
        message: a.message,
        severity: a.severity,
        status: a.status,
        source: a.source,
        createdAt: a.createdAt,
        updatedAt: a.updatedAt,
      })),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async getAlertById(id: string) {
    const alert = await this.alertsRepo.findById(id);
    if (!alert) throw new NotFoundError('Alert');
    return alert;
  }

  async acknowledgeAlert(id: string) {
    const alert = await this.alertsRepo.findById(id);
    if (!alert) throw new NotFoundError('Alert');
    return this.alertsRepo.updateStatus(id, 'ACKNOWLEDGED');
  }

  async resolveAlert(id: string) {
    const alert = await this.alertsRepo.findById(id);
    if (!alert) throw new NotFoundError('Alert');
    return this.alertsRepo.updateStatus(id, 'RESOLVED');
  }
}
