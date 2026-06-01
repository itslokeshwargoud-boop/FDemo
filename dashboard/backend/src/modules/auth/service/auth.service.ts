import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { config } from '../../../config';
import { AuthRepository } from '../repository/auth.repository';
import { RegisterDto, LoginDto } from '../validation/auth.validation';
import { ConflictError, UnauthorizedError } from '../../../shared/errors';
import { AuthTokens, JwtPayload } from '../../../shared/types';

export class AuthService {
  constructor(private readonly authRepo: AuthRepository) {}

  async register(dto: RegisterDto): Promise<{ user: { id: string; email: string; name: string }; tokens: AuthTokens }> {
    const existing = await this.authRepo.findUserByEmail(dto.email);
    if (existing) {
      throw new ConflictError('Email already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.authRepo.createUser({
      email: dto.email,
      name: dto.name,
      passwordHash,
    });

    const tokens = await this.generateTokens({ userId: user.id, email: user.email });

    return {
      user: { id: user.id, email: user.email, name: user.name },
      tokens,
    };
  }

  async login(dto: LoginDto): Promise<{ user: { id: string; email: string; name: string }; tokens: AuthTokens }> {
    const user = await this.authRepo.findUserByEmail(dto.email);
    if (!user) {
      throw new UnauthorizedError('Invalid credentials');
    }

    const passwordMatch = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatch) {
      throw new UnauthorizedError('Invalid credentials');
    }

    const tokens = await this.generateTokens({ userId: user.id, email: user.email });

    return {
      user: { id: user.id, email: user.email, name: user.name },
      tokens,
    };
  }

  async refreshTokens(refreshToken: string): Promise<AuthTokens> {
    const stored = await this.authRepo.findRefreshToken(refreshToken);
    if (!stored) {
      throw new UnauthorizedError('Invalid refresh token');
    }

    if (stored.expiresAt < new Date()) {
      await this.authRepo.deleteRefreshToken(refreshToken);
      throw new UnauthorizedError('Refresh token expired');
    }

    // Rotate: delete old token
    await this.authRepo.deleteRefreshToken(refreshToken);

    // Generate new pair
    const tokens = await this.generateTokens({
      userId: stored.user.id,
      email: stored.user.email,
    });

    return tokens;
  }

  async logout(refreshToken: string): Promise<void> {
    await this.authRepo.deleteRefreshToken(refreshToken);
  }

  async getProfile(userId: string) {
    const user = await this.authRepo.findUserById(userId);
    if (!user) {
      throw new UnauthorizedError('User not found');
    }
    return { id: user.id, email: user.email, name: user.name, createdAt: user.createdAt };
  }

  private async generateTokens(payload: JwtPayload): Promise<AuthTokens> {
    const accessToken = jwt.sign(payload, config.jwt.accessSecret, {
      expiresIn: config.jwt.accessExpiresIn,
    });

    const refreshToken = crypto.randomBytes(40).toString('hex');

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    await this.authRepo.createRefreshToken({
      token: refreshToken,
      userId: payload.userId,
      expiresAt,
    });

    return { accessToken, refreshToken };
  }
}
