import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { Button, Input, Select, Modal, Card, Badge, EmptyState, useToast } from '../components/ui';

const ROLE_OPTIONS = [
  { value: 'ADMIN', label: 'Admin' },
  { value: 'MANAGER', label: 'Manager' },
  { value: 'SHOP_FLOOR', label: 'Shop Floor Sales' },
  { value: 'RECORD_KEEPER', label: 'Record Keeper' },
];

const ROLE_LABELS = {
  ADMIN: 'Admin',
  MANAGER: 'Manager',
  SHOP_FLOOR: 'Shop Floor',
  RECORD_KEEPER: 'Record Keeper',
};

const ROLE_DESCRIPTIONS = {
  ADMIN: 'Full access to all modules including staff and system configuration.',
  MANAGER: 'Manage batches, sales, banking, bookings, inventory, customers, farmers, and reports.',
  SHOP_FLOOR: 'Record sales, manage inventory counts, and view customer info.',
  RECORD_KEEPER: 'Enter banking transactions and view bookings.',
};

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function Staff() {
  const { user: currentUser } = useAuth();
  const toast = useToast();
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [showResetPassword, setShowResetPassword] = useState(null);

  const loadStaff = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get('/auth/staff');
      setStaff(data.staff || []);
    } catch {
      toast.error('Failed to load staff');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadStaff(); }, [loadStaff]);

  const activeStaff = staff.filter(s => s.isActive);
  const inactiveStaff = staff.filter(s => !s.isActive);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-body text-surface-500">Loading staff…</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-display text-surface-900">Staff</h1>
          <p className="text-caption text-surface-600 mt-1">
            Manage team members and their access levels.
          </p>
        </div>
        <Button variant="primary" onClick={() => setShowCreate(true)}>
          Add staff member
        </Button>
      </div>

      {/* Active staff */}
      {activeStaff.length === 0 ? (
        <Card>
          <EmptyState
            title="No staff members"
            description="Add your first team member to get started."
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {activeStaff.map(member => (
            <StaffCard
              key={member.id}
              member={member}
              isSelf={member.id === currentUser?.id}
              onEdit={() => setEditingUser(member)}
              onResetPassword={() => setShowResetPassword(member)}
            />
          ))}
        </div>
      )}

      {/* Inactive staff */}
      {inactiveStaff.length > 0 && (
        <div className="mt-10">
          <h2 className="text-heading text-surface-700 mb-3">Deactivated</h2>
          <div className="space-y-3 opacity-60">
            {inactiveStaff.map(member => (
              <StaffCard
                key={member.id}
                member={member}
                isSelf={member.id === currentUser?.id}
                onEdit={() => setEditingUser(member)}
                onResetPassword={() => setShowResetPassword(member)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <CreateStaffModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); loadStaff(); }}
        />
      )}

      {/* Edit modal */}
      {editingUser && (
        <EditStaffModal
          member={editingUser}
          isSelf={editingUser.id === currentUser?.id}
          onClose={() => setEditingUser(null)}
          onUpdated={() => { setEditingUser(null); loadStaff(); }}
        />
      )}

      {/* Reset password modal */}
      {showResetPassword && (
        <ResetPasswordModal
          member={showResetPassword}
          onClose={() => setShowResetPassword(null)}
          onReset={() => { setShowResetPassword(null); toast.success('Password reset successfully'); }}
        />
      )}
    </div>
  );
}

// ─── Staff Card ──────────────────────────────────────────────

function StaffCard({ member, isSelf, onEdit, onResetPassword }) {
  return (
    <Card padding="comfortable">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {/* Avatar circle */}
          <div className="w-10 h-10 shrink-0 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-body-medium font-semibold">
            {member.firstName?.[0]}{member.lastName?.[0]}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-body-medium text-surface-900 font-medium">
                {member.firstName} {member.lastName}
              </span>
              <Badge variant={member.isActive ? 'info' : 'neutral'} size="sm">
                {ROLE_LABELS[member.role] || member.role}
              </Badge>
              {isSelf && <Badge variant="success" size="sm">You</Badge>}
              {!member.isActive && <Badge variant="error" size="sm">Deactivated</Badge>}
            </div>
            <p className="text-caption text-surface-500 truncate">
              {member.phone}
              {member.email && <> · {member.email}</>}
              {' · '}Joined {formatDate(member.createdAt)}
            </p>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="ghost" size="sm" onClick={onResetPassword}>
            Reset password
          </Button>
          <Button variant="secondary" size="sm" onClick={onEdit}>
            Edit
          </Button>
        </div>
      </div>
    </Card>
  );
}

// ─── Create Staff Modal ──────────────────────────────────────

function CreateStaffModal({ onClose, onCreated }) {
  const toast = useToast();
  const [form, setForm] = useState({
    firstName: '', lastName: '', phone: '', email: '', password: '', role: 'RECORD_KEEPER',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.firstName.trim() || !form.lastName.trim()) {
      return setError('First and last name are required.');
    }
    if (!form.phone.trim()) {
      return setError('Phone number is required.');
    }
    if (!form.password || form.password.length < 8) {
      return setError('Password must be at least 8 characters.');
    }

    setSaving(true);
    try {
      await api.post('/auth/register', {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || undefined,
        password: form.password,
        role: form.role,
      });
      toast.success(`${form.firstName} added as ${ROLE_LABELS[form.role]}`);
      onCreated();
    } catch (err) {
      setError(err.error || 'Failed to create staff member.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Add staff member">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="bg-error-50 text-error-700 text-body p-3 rounded-md border border-error-100">
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="First name"
            value={form.firstName}
            onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))}
            required
          />
          <Input
            label="Last name"
            value={form.lastName}
            onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))}
            required
          />
        </div>

        <Input
          label="Phone number"
          value={form.phone}
          onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
          placeholder="08012345678"
          required
        />

        <Input
          label="Email (optional)"
          type="email"
          value={form.email}
          onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
          placeholder="name@fresheggs.com"
        />

        <Input
          label="Password"
          type="password"
          value={form.password}
          onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
          placeholder="Minimum 8 characters"
          required
        />

        <div>
          <label className="block text-body-medium text-surface-700 mb-1">Role</label>
          <select
            value={form.role}
            onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
            className="w-full h-10 px-3 bg-surface-0 border border-surface-200 rounded-md text-body text-surface-800 hover:border-surface-300 focus:ring-2 focus:ring-brand-500/15 focus:border-brand-500 focus:outline-none transition-all duration-fast"
          >
            {ROLE_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <p className="mt-1 text-caption text-surface-500">
            {ROLE_DESCRIPTIONS[form.role]}
          </p>
        </div>

        <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-2 border-t border-surface-200">
          <Button variant="secondary" onClick={onClose} type="button">Cancel</Button>
          <Button variant="primary" type="submit" loading={saving}>Add staff member</Button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Edit Staff Modal ────────────────────────────────────────

function EditStaffModal({ member, isSelf, onClose, onUpdated }) {
  const toast = useToast();
  const [form, setForm] = useState({
    firstName: member.firstName,
    lastName: member.lastName,
    phone: member.phone || '',
    email: member.email || '',
    role: member.role,
    isActive: member.isActive,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await api.patch(`/auth/staff/${member.id}`, {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || null,
        role: form.role,
        isActive: form.isActive,
      });
      toast.success('Staff member updated');
      onUpdated();
    } catch (err) {
      setError(err.error || 'Failed to update staff member.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={`Edit ${member.firstName} ${member.lastName}`}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="bg-error-50 text-error-700 text-body p-3 rounded-md border border-error-100">
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="First name"
            value={form.firstName}
            onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))}
            required
          />
          <Input
            label="Last name"
            value={form.lastName}
            onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))}
            required
          />
        </div>

        <Input
          label="Phone number"
          value={form.phone}
          onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
          required
        />

        <Input
          label="Email"
          type="email"
          value={form.email}
          onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
        />

        <div>
          <label className="block text-body-medium text-surface-700 mb-1">Role</label>
          <select
            value={form.role}
            onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
            disabled={isSelf}
            className="w-full h-10 px-3 bg-surface-0 border border-surface-200 rounded-md text-body text-surface-800 hover:border-surface-300 focus:ring-2 focus:ring-brand-500/15 focus:border-brand-500 focus:outline-none transition-all duration-fast disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {ROLE_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          {isSelf && (
            <p className="mt-1 text-caption text-surface-500">You cannot change your own role.</p>
          )}
          {!isSelf && (
            <p className="mt-1 text-caption text-surface-500">{ROLE_DESCRIPTIONS[form.role]}</p>
          )}
        </div>

        {!isSelf && (
          <div className="flex items-center gap-3">
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-surface-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-600"></div>
            </label>
            <span className="text-body text-surface-700">Account active</span>
          </div>
        )}

        <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-2 border-t border-surface-200">
          <Button variant="secondary" onClick={onClose} type="button">Cancel</Button>
          <Button variant="primary" type="submit" loading={saving}>Save changes</Button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Reset Password Modal ────────────────────────────────────

function ResetPasswordModal({ member, onClose, onReset }) {
  const toast = useToast();
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      return setError('Password must be at least 8 characters.');
    }
    setError('');
    setSaving(true);
    try {
      await api.post(`/auth/staff/${member.id}/reset-password`, { newPassword });
      onReset();
    } catch (err) {
      setError(err.error || 'Failed to reset password.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={`Reset password for ${member.firstName}`}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-body text-surface-600">
          Set a new password for <span className="font-medium text-surface-900">{member.firstName} {member.lastName}</span>. They will be logged out and need to sign in again.
        </p>

        {error && (
          <div className="bg-error-50 text-error-700 text-body p-3 rounded-md border border-error-100">
            {error}
          </div>
        )}

        <Input
          label="New password"
          type="password"
          value={newPassword}
          onChange={e => setNewPassword(e.target.value)}
          placeholder="Minimum 8 characters"
          required
        />

        <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-2 border-t border-surface-200">
          <Button variant="secondary" onClick={onClose} type="button">Cancel</Button>
          <Button variant="primary" type="submit" loading={saving}>Reset password</Button>
        </div>
      </form>
    </Modal>
  );
}
