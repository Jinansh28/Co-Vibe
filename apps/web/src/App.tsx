import React, { useState } from 'react';
import './index.css';
import { NotificationProvider } from './context/NotificationContext.js';
import { AuthProvider } from './features/auth/AuthProvider.js';
import { ProtectedRoute } from './features/auth/ProtectedRoute.js';
import { AppLayout } from './components/layout/AppLayout.js';
import { ProjectsPage } from './features/projects/ProjectsPage.js';

function MainContent() {
  const [activeView, setActiveView] = useState<'dashboard' | 'workspace'>('dashboard');
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);

  const handleOpenWorkspace = (projectId: string, workspaceId?: string) => {
    setActiveProjectId(projectId);
    setActiveWorkspaceId(workspaceId || null);
    setActiveView('workspace');
  };

  if (activeView === 'workspace') {
    return <AppLayout workspaceId={activeWorkspaceId} onBackToDashboard={() => setActiveView('dashboard')} />;
  }

  return <ProjectsPage onOpenWorkspace={handleOpenWorkspace} />;
}

export default function App() {
  return (
    <NotificationProvider>
      <AuthProvider>
        <ProtectedRoute>
          <MainContent />
        </ProtectedRoute>
      </AuthProvider>
    </NotificationProvider>
  );
}


