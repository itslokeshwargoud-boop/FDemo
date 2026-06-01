import { Prisma } from '@prisma/client';
import { prisma } from '../../../config/database';

export class AlertsRepository {
  async findMany(params: {
    skip: number;
    take: number;
    where?: Prisma.AlertWhereInput;
  }) {
    const [data, total] = await Promise.all([
      prisma.alert.findMany({
        where: params.where,
        orderBy: { createdAt: 'desc' },
        skip: params.skip,
        take: params.take,
      }),
      prisma.alert.count({ where: params.where }),
    ]);

    return { data, total };
  }

  async findById(id: string) {
    return prisma.alert.findUnique({ where: { id } });
  }

  async updateStatus(id: string, status: 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED') {
    return prisma.alert.update({
      where: { id },
      data: { status },
    });
  }
}
