import React, { useState } from 'react';
import { useAuth } from './useAuth.js';
import { useNotification } from '../../context/NotificationContext.js';

interface LoginPageProps {
  onSuccess?: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onSuccess }) => {
  const { signInWithEmail, signUpWithEmail } = useAuth();
  const { showNotification } = useNotification();

  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!email || !password) {
      const msg = 'Please fill in both email and password fields.';
      setErrorMsg(msg);
      showNotification(msg, 'warning');
      return;
    }

    if (password.length < 6) {
      const msg = 'Password must be at least 6 characters long.';
      setErrorMsg(msg);
      showNotification(msg, 'warning');
      return;
    }

    setIsSubmitting(true);

    try {
      if (mode === 'signin') {
        const { error } = await signInWithEmail(email, password);
        if (error) {
          setErrorMsg(error.message);
          showNotification(error.message, 'error');
        } else {
          showNotification('Successfully signed in!', 'success');
          if (onSuccess) onSuccess();
        }
      } else {
        const { error } = await signUpWithEmail(email, password);
        if (error) {
          setErrorMsg(error.message);
          showNotification(error.message, 'error');
        } else {
          showNotification('Account created successfully! Check your email to confirm.', 'success');
          if (onSuccess) onSuccess();
        }
      }
    } catch (err: any) {
      const msg = err.message || 'An unexpected error occurred';
      setErrorMsg(msg);
      showNotification(msg, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        width: '100vw',
        backgroundColor: 'var(--bg-app, #0f172a)',
        color: 'var(--text-primary, #f8fafc)',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        padding: '24px',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '420px',
          padding: '36px',
          borderRadius: '16px',
          backgroundColor: 'rgba(30, 41, 59, 0.75)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.4), 0 0 40px rgba(99, 102, 241, 0.15)',
        }}
      >
        {/* Header Branding */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div
            style={{
              fontSize: '28px',
              fontWeight: 800,
              background: 'linear-gradient(135deg, #818cf8 0%, #c084fc 50%, #f472b6 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              letterSpacing: '-0.5px',
              marginBottom: '8px',
            }}
          >
            Co-Vibe
          </div>
          <p style={{ margin: 0, fontSize: '14px', color: '#94a3b8' }}>
            Collaborative AI Vibe-Coding Workspace
          </p>
        </div>

        {/* Mode Toggle Switcher */}
        <div
          style={{
            display: 'flex',
            backgroundColor: 'rgba(15, 23, 42, 0.6)',
            borderRadius: '10px',
            padding: '4px',
            marginBottom: '24px',
            border: '1px solid rgba(255, 255, 255, 0.05)',
          }}
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'signin'}
            onClick={() => {
              setMode('signin');
              setErrorMsg(null);
            }}
            style={{
              flex: 1,
              padding: '10px 16px',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 600,
              transition: 'all 0.2s ease',
              backgroundColor: mode === 'signin' ? 'var(--accent-primary, #6366f1)' : 'transparent',
              color: mode === 'signin' ? '#ffffff' : '#94a3b8',
            }}
          >
            Sign In
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'signup'}
            onClick={() => {
              setMode('signup');
              setErrorMsg(null);
            }}
            style={{
              flex: 1,
              padding: '10px 16px',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 600,
              transition: 'all 0.2s ease',
              backgroundColor: mode === 'signup' ? 'var(--accent-primary, #6366f1)' : 'transparent',
              color: mode === 'signup' ? '#ffffff' : '#94a3b8',
            }}
          >
            Sign Up
          </button>
        </div>

        {/* Inline Error Message */}
        {errorMsg && (
          <div
            role="alert"
            style={{
              padding: '12px 14px',
              borderRadius: '8px',
              backgroundColor: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#fca5a5',
              fontSize: '13px',
              marginBottom: '20px',
            }}
          >
            {errorMsg}
          </div>
        )}

        {/* Auth Form */}
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '18px' }}>
            <label
              htmlFor="email"
              style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 600,
                color: '#cbd5e1',
                marginBottom: '6px',
              }}
            >
              Email Address
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="developer@example.com"
              required
              style={{
                width: '100%',
                padding: '12px 14px',
                borderRadius: '8px',
                backgroundColor: 'rgba(15, 23, 42, 0.8)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                color: '#ffffff',
                fontSize: '14px',
                boxSizing: 'border-box',
                outline: 'none',
              }}
            />
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label
              htmlFor="password"
              style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 600,
                color: '#cbd5e1',
                marginBottom: '6px',
              }}
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={6}
              style={{
                width: '100%',
                padding: '12px 14px',
                borderRadius: '8px',
                backgroundColor: 'rgba(15, 23, 42, 0.8)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                color: '#ffffff',
                fontSize: '14px',
                boxSizing: 'border-box',
                outline: 'none',
              }}
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            style={{
              width: '100%',
              padding: '12px',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: '#6366f1',
              color: '#ffffff',
              fontSize: '14px',
              fontWeight: 700,
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              opacity: isSubmitting ? 0.7 : 1,
              transition: 'background-color 0.2s ease, opacity 0.2s ease',
              boxShadow: '0 4px 12px rgba(99, 102, 241, 0.4)',
            }}
          >
            {isSubmitting
              ? mode === 'signin'
                ? 'Signing In...'
                : 'Creating Account...'
              : mode === 'signin'
                ? 'Sign In'
                : 'Create Account'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default LoginPage;
