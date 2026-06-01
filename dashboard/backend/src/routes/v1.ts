import { Router } from 'express';
import { AuthController } from '../modules/auth/controller/auth.controller';
import { AuthService } from '../modules/auth/service/auth.service';
import { AuthRepository } from '../modules/auth/repository/auth.repository';
import { MetricsController } from '../modules/metrics/controller/metrics.controller';
import { MetricsService } from '../modules/metrics/service/metrics.service';
import { MetricsRepository } from '../modules/metrics/repository/metrics.repository';
import { AlertsController } from '../modules/alerts/controller/alerts.controller';
import { AlertsService } from '../modules/alerts/service/alerts.service';
import { AlertsRepository } from '../modules/alerts/repository/alerts.repository';
import { requireAuth, validate } from '../middleware';
import { registerSchema, loginSchema } from '../modules/auth/validation/auth.validation';
import { dashboardQuerySchema } from '../modules/metrics/validation/metrics.validation';
import { alertsQuerySchema } from '../modules/alerts/validation/alerts.validation';

const router = Router();

// --- Dependency Injection ---
const authRepo = new AuthRepository();
const authService = new AuthService(authRepo);
const authController = new AuthController(authService);

const metricsRepo = new MetricsRepository();
const metricsService = new MetricsService(metricsRepo);
const metricsController = new MetricsController(metricsService);

const alertsRepo = new AlertsRepository();
const alertsService = new AlertsService(alertsRepo);
const alertsController = new AlertsController(alertsService);

// --- Auth Routes ---
router.post('/auth/register', validate(registerSchema), authController.register);
router.post('/auth/login', validate(loginSchema), authController.login);
router.post('/auth/refresh', authController.refresh);
router.post('/auth/logout', authController.logout);
router.get('/auth/me', requireAuth, authController.me);

// --- Metrics Routes ---
router.get(
  '/metrics/dashboard',
  requireAuth,
  validate(dashboardQuerySchema, 'query'),
  metricsController.getDashboard
);

// --- Alerts Routes ---
router.get(
  '/alerts',
  requireAuth,
  validate(alertsQuerySchema, 'query'),
  alertsController.getAlerts
);
router.get('/alerts/:id', requireAuth, alertsController.getAlert);
router.patch('/alerts/:id/acknowledge', requireAuth, alertsController.acknowledgeAlert);
router.patch('/alerts/:id/resolve', requireAuth, alertsController.resolveAlert);

export { router as v1Router };
