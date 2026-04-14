import bcrypt from 'bcrypt';
import crypto from 'crypto';
import prisma from '../plugins/prisma.js';
import { config } from '../config/env.js';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyToken,
  authenticate,
} from '../plugins/auth.js';

const SALT_ROUNDS = 12;

function normalizeEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  return email || null;
}

function normalizePhone(value) {
  return String(value || '').replace(/\s+/g, '').trim();
}

/**
 * Auth routes — registration, login, refresh, logout, me
 */
export default async function authRoutes(fastify) {
  // ── Register ──────────────────────────────────────────────
  fastify.post('/auth/register', {
    schema: {
      body: {
        type: 'object',
        required: ['password', 'firstName', 'lastName', 'phone'],
        properties: {
          email: { type: 'string' },
          password: { type: 'string', minLength: 8 },
          firstName: { type: 'string', minLength: 1 },
          lastName: { type: 'string', minLength: 1 },
          phone: { type: 'string' },
          role: { type: 'string', enum: ['ADMIN', 'MANAGER', 'SHOP_FLOOR', 'RECORD_KEEPER'] },
        },
      },
    },
    handler: async (request, reply) => {
      const { email, password, firstName, lastName, phone, role } = request.body;
      const normalizedEmail = normalizeEmail(email);
      const normalizedPhone = normalizePhone(phone);

      if (!normalizedPhone) {
        return reply.code(400).send({ error: 'Phone number is required' });
      }

      // Check if user exists. Same reason as the login handler: use findFirst
      // for phone because older production DBs may not have the unique
      // constraint, which would make findUnique throw a Prisma validation error.
      const [existingByEmail, existingByPhone] = await Promise.all([
        normalizedEmail ? prisma.user.findUnique({ where: { email: normalizedEmail } }) : Promise.resolve(null),
        prisma.user.findFirst({ where: { phone: normalizedPhone } }),
      ]);
      if (existingByEmail) {
        return reply.code(409).send({ error: 'Email already registered' });
      }
      if (existingByPhone) {
        return reply.code(409).send({ error: 'Phone number already registered' });
      }

      const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

      const user = await prisma.user.create({
        data: {
          email: normalizedEmail,
          passwordHash,
          firstName,
          lastName,
          phone: normalizedPhone,
          role: role || 'RECORD_KEEPER', // Default to least privilege for staff
        },
        select: { id: true, email: true, firstName: true, lastName: true, phone: true, role: true },
      });

      return reply.code(201).send({ user });
    },
  });

  // ── Login ─────────────────────────────────────────────────
  fastify.post('/auth/login', {
    schema: {
      body: {
        type: 'object',
        required: ['identifier', 'password'],
        properties: {
          identifier: { type: 'string' },
          password: { type: 'string' },
        },
      },
    },
    handler: async (request, reply) => {
      const { identifier, password } = request.body;
      const normalizedIdentifier = String(identifier || '').trim();
      const normalizedEmail = normalizeEmail(normalizedIdentifier);
      const normalizedPhone = normalizePhone(normalizedIdentifier);

      // Use findFirst (not findUnique) for phone lookup because some deployed
      // databases do not have a unique constraint on User.phone yet — the
      // newer schema marks phone as @unique but older production databases
      // predate that. findFirst works regardless; the subsequent isActive
      // and bcrypt.compare checks still reject bad credentials. Email stays
      // on findUnique since it's uniformly @unique everywhere.
      const user = normalizedIdentifier.includes('@')
        ? await prisma.user.findUnique({ where: { email: normalizedEmail } })
        : await prisma.user.findFirst({
            where: { phone: normalizedPhone, isActive: true },
          });
      if (!user || !user.isActive) {
        return reply.code(401).send({ error: 'Invalid sign-in details or password' });
      }

      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) {
        return reply.code(401).send({ error: 'Invalid sign-in details or password' });
      }

      const accessToken = generateAccessToken(user);
      const refreshToken = generateRefreshToken(user);

      // Store refresh token in DB
      await prisma.refreshToken.create({
        data: {
          token: crypto.createHash('sha256').update(refreshToken).digest('hex'),
          userId: user.id,
          expiresAt: new Date(Date.now() + config.jwtRefreshExpiryMs),
        },
      });

      return reply.send({
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          phone: user.phone,
          role: user.role,
        },
      });
    },
  });

  // ── Refresh Token ─────────────────────────────────────────
  fastify.post('/auth/refresh', {
    schema: {
      body: {
        type: 'object',
        required: ['refreshToken'],
        properties: {
          refreshToken: { type: 'string' },
        },
      },
    },
    handler: async (request, reply) => {
      const { refreshToken } = request.body;

      // Verify JWT validity
      let decoded;
      try {
        decoded = verifyToken(refreshToken);
        if (decoded.type !== 'refresh') throw new Error('Not a refresh token');
      } catch {
        return reply.code(401).send({ error: 'Invalid refresh token' });
      }

      // Check token exists in DB (not revoked)
      const hashedToken = crypto.createHash('sha256').update(refreshToken).digest('hex');
      const stored = await prisma.refreshToken.findUnique({ where: { token: hashedToken } });
      if (!stored || stored.expiresAt < new Date()) {
        return reply.code(401).send({ error: 'Refresh token expired or revoked' });
      }

      // Get user
      const user = await prisma.user.findUnique({ where: { id: decoded.sub } });
      if (!user || !user.isActive) {
        return reply.code(401).send({ error: 'User not found or inactive' });
      }

      // Rotate: delete old, issue new
      await prisma.refreshToken.delete({ where: { token: hashedToken } });

      const newAccessToken = generateAccessToken(user);
      const newRefreshToken = generateRefreshToken(user);

      await prisma.refreshToken.create({
        data: {
          token: crypto.createHash('sha256').update(newRefreshToken).digest('hex'),
          userId: user.id,
          expiresAt: new Date(Date.now() + config.jwtRefreshExpiryMs),
        },
      });

      return reply.send({
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
      });
    },
  });

  // ── Logout (revoke refresh token) ─────────────────────────
  fastify.post('/auth/logout', {
    schema: {
      body: {
        type: 'object',
        required: ['refreshToken'],
        properties: {
          refreshToken: { type: 'string' },
        },
      },
    },
    handler: async (request, reply) => {
      const { refreshToken } = request.body;
      const hashedToken = crypto.createHash('sha256').update(refreshToken).digest('hex');

      await prisma.refreshToken.deleteMany({ where: { token: hashedToken } });

      return reply.send({ message: 'Logged out' });
    },
  });

  // ── Get current user ──────────────────────────────────────
  fastify.get('/auth/me', {
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const user = await prisma.user.findUnique({
        where: { id: request.user.sub },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          role: true,
          createdAt: true,
        },
      });

      if (!user) {
        return reply.code(404).send({ error: 'User not found' });
      }

      return reply.send({ user });
    },
  });
}
