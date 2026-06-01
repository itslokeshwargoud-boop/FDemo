import { prisma } from '../../../config/database';

export class AuthRepository {
  async findUserByEmail(email: string) {
    return prisma.user.findUnique({ where: { email } });
  }

  async findUserById(id: string) {
    return prisma.user.findUnique({ where: { id } });
  }

  async createUser(data: { email: string; name: string; passwordHash: string }) {
    return prisma.user.create({ data });
  }

  async createRefreshToken(data: { token: string; userId: string; expiresAt: Date }) {
    return prisma.refreshToken.create({ data });
  }

  async findRefreshToken(token: string) {
    return prisma.refreshToken.findUnique({
      where: { token },
      include: { user: true },
    });
  }

  async deleteRefreshToken(token: string) {
    return prisma.refreshToken.deleteMany({ where: { token } });
  }

  async deleteAllUserRefreshTokens(userId: string) {
    return prisma.refreshToken.deleteMany({ where: { userId } });
  }

  async deleteExpiredTokens() {
    return prisma.refreshToken.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
  }
}
