import React from 'react';
import './index.css';
import { NotificationProvider } from './context/NotificationContext.js';
import { AuthProvider } from './features/auth/AuthProvider.js';
import { ProtectedRoute } from './features/auth/ProtectedRoute.js';
import { AppLayout } from './components/layout/AppLayout.js';

export default function App() {
  return (
    <NotificationProvider>
      <AuthProvider>
        <ProtectedRoute>
          <AppLayout />
        </ProtectedRoute>
      </AuthProvider>
    </NotificationProvider>
  );
}

