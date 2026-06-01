import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { config } from './config';
import { requestLogger, errorHandler } from './middleware';
import { v1Router } from './routes/v1';
import { sendSuccess } from './shared/utils';

const app = express();

// --- Security ---
app.use(helmet());
app.use(cors({
  origin: config.cors.origin,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// --- Rate Limiting ---
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { message: 'Too many requests, please try again later', code: 'RATE_LIMIT' } },
});
app.use('/api/', limiter);

// Auth endpoints get stricter rate limit
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { message: 'Too many auth attempts, please try again later', code: 'RATE_LIMIT' } },
});
app.use('/api/v1/auth/', authLimiter);

// --- Parsing ---
// Cookie-parser is needed for refresh token rotation.
// CSRF protection is handled by: SameSite cookie attribute, CORS origin validation,
// and Bearer token requirement on all state-changing authenticated endpoints.
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(compression());

// --- Logging ---
app.use(requestLogger);

// --- Health Check ---
app.get('/health', (_req, res) => {
  sendSuccess(res, {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: config.nodeEnv,
  });
});

// --- API Routes ---
app.use('/api/v1', v1Router);

// --- 404 Handler ---
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: { message: 'Endpoint not found', code: 'NOT_FOUND' },
  });
});

// --- Error Handler (must be last) ---
app.use(errorHandler);

export { app };
