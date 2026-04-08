import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { config } from '../config/env.js';

/**
 * Generate access token (short-lived, 15 min)
 */
export function generateAccessToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
    },
    config.jwtSecret,
    { expiresIn: config.jwtAccessExpiry }
  );
}

/**
 * Generate refresh token (long-lived, 7 days)
 */
export function generateRefreshToken(user) {
  return jwt.sign(
    { sub: user.id, type: 'refresh', jti: crypto.randomUUID() },
    config.jwtSecret,
    { expiresIn: config.jwtRefreshExpiry }
  );
}

/**
 * Verify any JWT token
 */
export function verifyToken(token) {
  return jwt.verify(token, config.jwtSecret);
}

/**
 * Fastify preHandler — extracts and validates JWT from Authorization header.
 * Attaches decoded user to request.user
 */
export async function authenticate(request, reply) {
  const authHeader = request.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return reply.code(401).send({ error: 'Missing or invalid authorization header' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = verifyToken(token);
    request.user = decoded;
  } catch (err) {
    return reply.code(401).send({ error: 'Invalid or expired token' });
  }
}
