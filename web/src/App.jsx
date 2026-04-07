import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Batches from './pages/Batches';
import BatchDetail from './pages/BatchDetail';
import Sales from './pages/Sales';
import Banking from './pages/Banking';
import Bookings from './pages/Bookings';
import Inventory from './pages/Inventory';
import Customers from './pages/Customers';
import Portal from './pages/Portal';
import Reports from './pages/Reports';
import ReportDetail from './pages/ReportDetail';
import AdminConfig from './pages/AdminConfig';
import Items from './pages/Items';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/portal" element={<Portal />} />

          <Route
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="batches" element={<Batches />} />
            <Route path="batches/:id" element={<BatchDetail />} />
            <Route
              path="sales"
              element={
                <ProtectedRoute roles={['ADMIN', 'MANAGER', 'SHOP_FLOOR']}>
                  <Sales />
                </ProtectedRoute>
              }
            />
            <Route
              path="banking"
              element={
                <ProtectedRoute roles={['ADMIN', 'MANAGER', 'RECORD_KEEPER']}>
                  <Banking />
                </ProtectedRoute>
              }
            />
            <Route path="bookings" element={<Bookings />} />
            <Route path="inventory" element={<Inventory />} />
            <Route
              path="customers"
              element={
                <ProtectedRoute roles={['ADMIN', 'MANAGER', 'SHOP_FLOOR']}>
                  <Customers />
                </ProtectedRoute>
              }
            />
            <Route
              path="reports"
              element={
                <ProtectedRoute roles={['ADMIN', 'MANAGER']}>
                  <Reports />
                </ProtectedRoute>
              }
            />
            <Route
              path="reports/:reportType"
              element={
                <ProtectedRoute roles={['ADMIN', 'MANAGER']}>
                  <ReportDetail />
                </ProtectedRoute>
              }
            />
            <Route
              path="items"
              element={
                <ProtectedRoute roles={['ADMIN', 'MANAGER']}>
                  <Items />
                </ProtectedRoute>
              }
            />
            <Route
              path="admin"
              element={
                <ProtectedRoute roles={['ADMIN']}>
                  <AdminConfig />
                </ProtectedRoute>
              }
            />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
