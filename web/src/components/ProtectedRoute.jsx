import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const STAFF_ROLES = ['ADMIN', 'MANAGER', 'SHOP_FLOOR', 'RECORD_KEEPER'];

export default function ProtectedRoute({ children, roles }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-surface-500">Loading...</div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  // CUSTOMER accounts cannot access the backend — redirect to portal
  if (!STAFF_ROLES.includes(user.role)) {
    return <Navigate to="/portal" replace />;
  }

  if (roles && !roles.includes(user.role)) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-error-500 text-center">
          <h2 className="text-xl font-bold">Access Denied</h2>
          <p className="mt-2">You don't have permission to view this page.</p>
        </div>
      </div>
    );
  }

  return children;
}
