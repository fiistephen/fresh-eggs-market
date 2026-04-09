import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui';

export default function Login() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(identifier, password);
      navigate('/');
    } catch (err) {
      setError(err.error || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-900 px-4">
      {/* Subtle warm gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-brand-900/20 via-transparent to-surface-900 pointer-events-none" />

      <div className="relative w-full max-w-sm">
        {/* Logo + branding */}
        <div className="text-center mb-8">
          <Link to="/" className="inline-block rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30">
            <img src="/logo.webp" alt="Fresh Eggs Market" className="w-20 h-20 mx-auto object-contain mb-4" />
            <h1 className="text-title text-white">Fresh Eggs Market</h1>
            <p className="text-caption text-surface-400 mt-1">Operations Management</p>
          </Link>
        </div>

        {/* Login card — Apple-style depth */}
        <form
          onSubmit={handleSubmit}
          className="bg-surface-0 shadow-xl rounded-lg p-6 space-y-5"
        >
          <div>
            <h2 className="text-heading text-surface-800">Sign in</h2>
            <p className="text-caption text-surface-500 mt-0.5">Enter your credentials to continue</p>
          </div>

          {error && (
            <div className="flex items-start gap-2 bg-error-50 text-error-700 text-body p-3 rounded-md border border-error-100">
              <svg className="w-4 h-4 mt-0.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-body-medium text-surface-700 mb-1">
              Phone number or email
            </label>
            <input
              type="text"
              required
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              className="w-full h-10 px-3 bg-surface-0 border border-surface-200 rounded-md text-body text-surface-800 placeholder:text-surface-400 hover:border-surface-300 focus:ring-2 focus:ring-brand-500/15 focus:border-brand-500 focus:outline-none transition-all duration-fast"
              placeholder="08012345678 or you@fresheggs.com"
            />
          </div>

          <div>
            <label className="block text-body-medium text-surface-700 mb-1">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full h-10 px-3 bg-surface-0 border border-surface-200 rounded-md text-body text-surface-800 placeholder:text-surface-400 hover:border-surface-300 focus:ring-2 focus:ring-brand-500/15 focus:border-brand-500 focus:outline-none transition-all duration-fast"
            />
          </div>

          <Button
            type="submit"
            loading={loading}
            size="lg"
            className="w-full"
          >
            Sign in
          </Button>
        </form>

        {/* Footer */}
        <p className="text-center text-caption text-surface-500 mt-6">
          Fresh Eggs Market &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
