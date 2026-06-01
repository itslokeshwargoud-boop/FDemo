import { prisma } from '../../../config/database';

export class MetricsRepository {
  async getSnapshotsInRange(startDate: Date, endDate: Date) {
    return prisma.metricSnapshot.findMany({
      where: {
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: { date: 'asc' },
    });
  }

  async getLatestSnapshot() {
    return prisma.metricSnapshot.findFirst({
      orderBy: { date: 'desc' },
    });
  }

  async getSnapshotByDate(date: Date) {
    return prisma.metricSnapshot.findUnique({
      where: { date },
    });
  }
}
