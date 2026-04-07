import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from './config/env.js';

// Route modules
import authRoutes from './routes/auth.js';
import batchRoutes from './routes/batches.js';
import salesRoutes from './routes/sales.js';
import bookingRoutes from './routes/bookings.js';
import bankingRoutes from './routes/banking.js';
import inventoryRoutes from './routes/inventory.js';
import customerRoutes from './routes/customers.js';
import alertRoutes from './routes/alerts.js';
import portalRoutes from './routes/portal.js';
import reportsRoutes from './routes/reports.js';

const app = Fastify({
  logger: {
    level: config.nodeEnv === 'production' ? 'info' : 'debug',
  },
});

// ── Plugins ───────────────────────────────────────────────────
await app.register(cors, {
  origin: config.corsOrigin,
  credentials: true,
});

// ── Health check ──────────────────────────────────────────────
app.get('/health', async () => ({
  status: 'ok',
  timestamp: new Date().toISOString(),
  env: config.nodeEnv,
}));

// ── API routes (all prefixed with /api) ───────────────────────
app.register(authRoutes, { prefix: '/api' });
app.register(batchRoutes, { prefix: '/api' });
app.register(salesRoutes, { prefix: '/api' });
app.register(bookingRoutes, { prefix: '/api' });
app.register(bankingRoutes, { prefix: '/api' });
app.register(inventoryRoutes, { prefix: '/api' });
app.register(customerRoutes, { prefix: '/api' });
app.register(alertRoutes, { prefix: '/api' });
app.register(portalRoutes, { prefix: '/api' });
app.register(reportsRoutes, { prefix: '/api' });

// ── Start server ──────────────────────────────────────────────
try {
  await app.listen({ port: config.port, host: config.host });
  console.log(`🥚 Fresh Eggs API running on port ${config.port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
