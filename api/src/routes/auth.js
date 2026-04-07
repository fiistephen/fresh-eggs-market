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

/**
 * Auth routes — registration, login, refresh, logout, me
 */
export default async function authRoutes(fastify) {
  // ── Register ──────────────────────────────────────────────
  fastify.post('/auth/register', {
    schema: {
      body: {
        type: 'object',
        required: ['email', 'password', 'firstName', 'lastName'],
        properties: {
          email: { type: 'string', format: 'email' },
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

      // Check if user exists
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        return reply.code(409).send({ error: 'Email already registered' });
      }

      const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

      const user = await prisma.user.create({
        data: {
          email,
          passwordHash,
          firstName,
          lastName,
          phone,
          role: role || 'RECORD_KEEPER', // Default to least privilege for staff
        },
        select: { id: true, email: true, firstName: true, lastName: true, role: true },
      });

      return reply.code(201).send({ user });
    },
  });

  // ── Login ─────────────────────────────────────────────────
  fastify.post('/auth/login', {
    schema: {
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string' },
        },
      },
    },
    handler: async (request, reply) => {
      const { email, password } = request.body;

      const user = await prisma.user.findUnique({ where: { email } });
      if (!user || !user.isActive) {
        return reply.code(401).send({ error: 'Invalid email or password' });
      }

      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) {
        return reply.code(401).send({ error: 'Invalid email or password' });
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
