import React, { ReactNode } from 'react';
import { useAuth } from './useAuth.js';
import { LoginPage } from './LoginPage.js';

interface ProtectedRouteProps {
  children: ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div
        data-testid="auth-loading"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          width: '100vw',
          backgroundColor: 'var(--bg-app, #0f172a)',
          color: 'var(--text-primary, #f8fafc)',
          fontSize: '14px',
          fontWeight: 500,
        }}
      >
        <div
          style={{
            width: '32px',
            height: '32px',
            border: '3px solid rgba(255, 255, 255, 0.1)',
            borderTopColor: '#6366f1',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
            marginBottom: '16px',
          }}
        />
        Loading workspace session...
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
