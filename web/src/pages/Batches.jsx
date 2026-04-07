import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';

const STATUS_COLORS = {
  OPEN: 'bg-blue-100 text-blue-700',
  RECEIVED: 'bg-green-100 text-green-700',
  CLOSED: 'bg-gray-100 text-gray-500',
};

const STATUS_LABELS = {
  OPEN: 'Open',
  RECEIVED: 'Received',
  CLOSED: 'Closed',
};

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatCurrency(n) {
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: 0 }).format(n);
}

export default function Batches() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState('');

  const canCreate = ['ADMIN', 'MANAGER'].includes(user?.role);

  useEffect(() => { loadBatches(); }, [filter]);

  async function loadBatches() {
    setLoading(true);
    try {
      const params = filter ? `?status=${filter}` : '';
      const data = await api.get(`/batches${params}`);
      setBatches(data.batches);
    } catch (err) {
      setError('Failed to load batches');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Batch Management</h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">Create, receive, and manage egg batches from farm to depot.</p>
        </div>
        {canCreate && (
          <button
            onClick={() => setShowCreate(true)}
            className="bg-brand-500 hover:bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
          >
            <span className="text-lg leading-none">+</span> New Batch
          </button>
        )}
      </div>

      {/* Status filter tabs */}
      <div className="overflow-x-auto mb-6">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        {[
          { value: '', label: 'All' },
          { value: 'OPEN', label: 'Open' },
          { value: 'RECEIVED', label: 'Received' },
          { value: 'CLOSED', label: 'Closed' },
        ].map(tab => (
          <button
            key={tab.value}
            onClick={() => setFilter(tab.value)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              filter === tab.value
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg mb-4 text-sm">{error}</div>
      )}

      {/* Batch list */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading batches...</div>
      ) : batches.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">📦</div>
          <p className="text-gray-500">No batches found</p>
          {canCreate && (
            <button
              onClick={() => setShowCreate(true)}
              className="mt-4 text-brand-500 hover:text-brand-600 text-sm font-medium"
            >
              Create your first batch
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-max">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Batch</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Expected Date</th>
                <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Qty (Expected)</th>
                <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Qty (Actual)</th>
                <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Wholesale</th>
                <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Retail</th>
                <th className="text-center py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="text-center py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Bookings</th>
              </tr>
            </thead>
            <tbody>
              {batches.map(batch => (
                <tr
                  key={batch.id}
                  onClick={() => navigate(`/batches/${batch.id}`)}
                  className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  <td className="py-3 px-4">
                    <span className="font-semibold text-gray-900">{batch.name}</span>
                    {batch.eggCodes.length > 0 && (
                      <span className="text-xs text-gray-400 ml-2">
                        {batch.eggCodes.map(ec => ec.code).join(', ')}
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-600">{formatDate(batch.expectedDate)}</td>
                  <td className="py-3 px-4 text-sm text-gray-600 text-right">{batch.expectedQuantity.toLocaleString()}</td>
                  <td className="py-3 px-4 text-sm text-right">
                    {batch.actualQuantity != null ? (
                      <span className="text-gray-900 font-medium">{batch.actualQuantity.toLocaleString()}</span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-600 text-right">{formatCurrency(batch.wholesalePrice)}</td>
                  <td className="py-3 px-4 text-sm text-gray-600 text-right">{formatCurrency(batch.retailPrice)}</td>
                  <td className="py-3 px-4 text-center">
                    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[batch.status]}`}>
                      {STATUS_LABELS[batch.status]}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-500 text-center">{batch._count.bookings}</td>
                </tr>
              ))}
            </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create batch modal */}
      {showCreate && (
        <CreateBatchModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); loadBatches(); }}
        />
      )}
    </div>
  );
}

function CreateBatchModal({ onClose, onCreated }) {
  const [form, setForm] = useState({
    expectedDate: '',
    expectedQuantity: 1800,
    availableForBooking: 1800,
    wholesalePrice: '',
    retailPrice: '',
    costPrice: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  function update(field, value) {
    setForm(f => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await api.post('/batches', {
        ...form,
        expectedQuantity: Number(form.expectedQuantity),
        availableForBooking: Number(form.availableForBooking),
        wholesalePrice: Number(form.wholesalePrice),
        retailPrice: Number(form.retailPrice),
        costPrice: Number(form.costPrice),
      });
      onCreated();
    } catch (err) {
      setError(err.error || 'Failed to create batch');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-4 sm:px-6 py-4 border-b border-gray-100">
          <h2 className="text-base sm:text-lg font-semibold text-gray-900">Create New Batch</h2>
          <p className="text-xs sm:text-sm text-gray-500">A batch will be auto-named from the expected date.</p>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4">
          {error && (
            <div className="bg-red-50 text-red-600 px-3 py-2 rounded-lg text-sm">{error}</div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Expected Arrival Date</label>
            <input
              type="date"
              required
              value={form.expectedDate}
              onChange={e => update('expectedDate', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Expected Quantity (crates)</label>
              <input
                type="number"
                required min="1"
                value={form.expectedQuantity}
                onChange={e => update('expectedQuantity', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Available for Booking</label>
              <input
                type="number"
                required min="0"
                value={form.availableForBooking}
                onChange={e => update('availableForBooking', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cost Price (₦)</label>
              <input
                type="number"
                required min="1"
                placeholder="4600"
                value={form.costPrice}
                onChange={e => update('costPrice', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Wholesale (₦)</label>
              <input
                type="number"
                required min="1"
                placeholder="5000"
                value={form.wholesalePrice}
                onChange={e => update('wholesalePrice', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Retail (₦)</label>
              <input
                type="number"
                required min="1"
                placeholder="5400"
                value={form.retailPrice}
                onChange={e => update('retailPrice', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
              />
            </div>
          </div>

          <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors w-full sm:w-auto"
            >
              {submitting ? 'Creating...' : 'Create Batch'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
