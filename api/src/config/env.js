import 'dotenv/config';

export const config = {
  port: parseInt(process.env.PORT || '3001'),
  host: process.env.HOST || '0.0.0.0',
  nodeEnv: process.env.NODE_ENV || 'development',

  // JWT
  jwtSecret: process.env.JWT_SECRET || 'change-me-in-production',
  jwtAccessExpiry: process.env.JWT_ACCESS_EXPIRY || '15m',
  jwtRefreshExpiry: process.env.JWT_REFRESH_EXPIRY || '7d',
  jwtRefreshExpiryMs: 7 * 24 * 60 * 60 * 1000, // 7 days in ms

  // Database
  databaseUrl: process.env.DATABASE_URL,

  // CORS
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
};
