import { useState, useEffect } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: '📊', roles: null },
  { to: '/batches', label: 'Batches', icon: '📦', roles: null },
  { to: '/sales', label: 'Sales', icon: '💰', roles: ['ADMIN', 'MANAGER', 'SHOP_FLOOR'] },
  { to: '/banking', label: 'Banking', icon: '🏦', roles: ['ADMIN', 'MANAGER', 'RECORD_KEEPER'] },
  { to: '/bookings', label: 'Bookings', icon: '📋', roles: null },
  { to: '/inventory', label: 'Inventory', icon: '🏬', roles: null },
  { to: '/customers', label: 'Customers', icon: '👥', roles: ['ADMIN', 'MANAGER', 'SHOP_FLOOR'] },
  { to: '/reports', label: 'Reports', icon: '🧾', roles: ['ADMIN', 'MANAGER'] },
  { to: '/items', label: 'Items', icon: '🥚', roles: ['ADMIN', 'MANAGER'] },
  { to: '/admin', label: 'Admin', icon: '⚙️', roles: ['ADMIN'] },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  // Close sidebar on escape key
  useEffect(() => {
    const handleEsc = (e) => { if (e.key === 'Escape') setSidebarOpen(false); };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  const visibleItems = NAV_ITEMS.filter(
    item => !item.roles || item.roles.includes(user?.role)
  );

  const SidebarContent = () => (
    <>
      {/* Logo + branding */}
      <div className="p-4 border-b border-gray-700">
        <Link to="/" className="flex items-center gap-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-400">
          <img src="/logo.webp" alt="Fresh Eggs" className="w-10 h-10 object-contain" />
          <div>
            <h1 className="text-base font-bold text-white">Fresh Eggs</h1>
            <p className="text-[10px] text-gray-400 leading-tight">Operations Management</p>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 overflow-y-auto">
        {visibleItems.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                isActive
                  ? 'bg-gray-800 text-green-400 border-r-2 border-green-400'
                  : 'text-gray-300 hover:bg-gray-800 hover:text-white'
              }`
            }
          >
            <span className="text-lg">{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* User info + logout */}
      <div className="p-4 border-t border-gray-700">
        <div className="text-sm">
          <p className="font-medium text-white">{user?.firstName} {user?.lastName}</p>
          <p className="text-xs text-gray-400 capitalize">{user?.role?.replace('_', ' ').toLowerCase()}</p>
        </div>
        <button
          onClick={logout}
          className="mt-3 w-full text-left text-xs text-gray-400 hover:text-red-400 transition-colors"
        >
          Sign out
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen flex bg-gray-50">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar — desktop: static, mobile: slide-in overlay */}
      <aside className={`
        fixed lg:static inset-y-0 left-0 z-50
        w-64 bg-gray-900 text-white flex flex-col
        transform transition-transform duration-200 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        <SidebarContent />
      </aside>

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar */}
        <header className="lg:hidden bg-white border-b px-4 py-3 flex items-center gap-3 sticky top-0 z-30">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1.5 -ml-1.5 rounded-lg hover:bg-gray-100 transition"
            aria-label="Open menu"
          >
            <svg className="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <Link to="/" className="flex items-center gap-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500">
            <img src="/logo.webp" alt="Fresh Eggs" className="w-7 h-7 object-contain" />
            <span className="font-bold text-gray-900 text-sm">Fresh Eggs</span>
          </Link>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto">
          <div className="p-4 md:p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
