import { Request, Response } from 'express';
import { AuthService } from '../service/auth.service';
import { asyncHandler, sendSuccess } from '../../../shared/utils';
import { config } from '../../../config';

const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: config.isProd,
  sameSite: config.isProd ? 'strict' as const : 'lax' as const,
  path: '/api/v1/auth',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

export class AuthController {
  constructor(private readonly authService: AuthService) {}

  register = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { user, tokens } = await this.authService.register(req.body);

    res.cookie('refreshToken', tokens.refreshToken, REFRESH_COOKIE_OPTIONS);
    sendSuccess(res, { user, accessToken: tokens.accessToken }, 201);
  });

  login = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { user, tokens } = await this.authService.login(req.body);

    res.cookie('refreshToken', tokens.refreshToken, REFRESH_COOKIE_OPTIONS);
    sendSuccess(res, { user, accessToken: tokens.accessToken });
  });

  refresh = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const refreshToken = req.cookies?.refreshToken;
    if (!refreshToken) {
      res.status(401).json({ success: false, error: { message: 'No refresh token', code: 'UNAUTHORIZED' } });
      return;
    }

    const tokens = await this.authService.refreshTokens(refreshToken);

    res.cookie('refreshToken', tokens.refreshToken, REFRESH_COOKIE_OPTIONS);
    sendSuccess(res, { accessToken: tokens.accessToken });
  });

  logout = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const refreshToken = req.cookies?.refreshToken;
    if (refreshToken) {
      await this.authService.logout(refreshToken);
    }

    res.clearCookie('refreshToken', { path: '/api/v1/auth' });
    sendSuccess(res, { message: 'Logged out successfully' });
  });

  me = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const user = await this.authService.getProfile(req.user!.userId);
    sendSuccess(res, { user });
  });
}
