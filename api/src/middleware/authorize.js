/**
 * Role-based authorization middleware.
 * Usage: { preHandler: [authenticate, authorize('ADMIN', 'MANAGER')] }
 *
 * @param  {...string} allowedRoles - Roles permitted to access this route
 */
export function authorize(...allowedRoles) {
  return async (request, reply) => {
    if (!request.user) {
      return reply.code(401).send({ error: 'Not authenticated' });
    }

    if (!allowedRoles.includes(request.user.role)) {
      return reply.code(403).send({
        error: 'Insufficient permissions',
        required: allowedRoles,
        current: request.user.role,
      });
    }
  };
}
