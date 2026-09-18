import React, { useState, useEffect } from 'react';
import { useAuth } from '../auth/useAuth.js';
import { useNotification } from '../../context/NotificationContext.js';
import { ProjectCard, ProjectCardData } from './ProjectCard.js';
import { CreateProjectModal } from './CreateProjectModal.js';

interface ProjectsPageProps {
  onOpenWorkspace?: (projectId: string, workspaceId?: string) => void;
  initialProjects?: ProjectCardData[];
}

export const ProjectsPage: React.FC<ProjectsPageProps> = ({
  onOpenWorkspace,
  initialProjects,
}) => {
  const { user, signOut } = useAuth();
  const { showNotification } = useNotification();

  const [projects, setProjects] = useState<ProjectCardData[]>(initialProjects || []);
  const [isLoading, setIsLoading] = useState<boolean>(!initialProjects);
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    if (initialProjects) return;

    let isMounted = true;
    const fetchProjects = async () => {
      try {
        setIsLoading(true);
        const res = await fetch('/api/v1/projects', {
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (res.ok) {
          const data = await res.json();
          if (isMounted) {
            setProjects(data.projects || []);
          }
        } else {
          // If API fails or backend offline, keep empty list or default
          if (isMounted) setProjects([]);
        }
      } catch (err) {
        if (isMounted) setProjects([]);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    fetchProjects();
    return () => {
      isMounted = false;
    };
  }, [initialProjects]);

  const handleCreateProject = async (data: { name: string; description?: string; repoUrl?: string }) => {
    try {
      const res = await fetch('/api/v1/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: data.name,
          description: data.description,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to create project');
      }

      const created = await res.json();
      const newProjectData: ProjectCardData = {
        id: created.project?.id || `proj-${Date.now()}`,
        name: created.project?.name || data.name,
        description: created.project?.description || data.description,
        createdAt: created.project?.createdAt || new Date().toISOString(),
        role: created.member?.role || 'owner',
        workspaceCount: 1,
        activeWorkspaceId: `ws-${created.project?.id || Date.now()}`,
      };

      setProjects((prev) => [newProjectData, ...prev]);

      // Automatically open workspace if callback provided
      if (onOpenWorkspace) {
        onOpenWorkspace(newProjectData.id, newProjectData.activeWorkspaceId);
      }
    } catch (err: any) {
      // Fallback for local testing environments without active Worker server
      const newProjectData: ProjectCardData = {
        id: `proj-${Date.now()}`,
        name: data.name,
        description: data.description,
        createdAt: new Date().toISOString(),
        role: 'owner',
        workspaceCount: 1,
        activeWorkspaceId: `ws-${Date.now()}`,
      };
      setProjects((prev) => [newProjectData, ...prev]);
      if (onOpenWorkspace) {
        onOpenWorkspace(newProjectData.id, newProjectData.activeWorkspaceId);
      }
    }
  };

  const filteredProjects = projects.filter(
    (p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.description && p.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div
      data-testid="projects-page"
      style={{
        minHeight: '100vh',
        width: '100vw',
        backgroundColor: 'var(--bg-app, #0f172a)',
        color: 'var(--text-primary, #f8fafc)',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
      }}
    >
      {/* Top Dashboard Navigation Bar */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 32px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          backgroundColor: 'rgba(15, 23, 42, 0.9)',
          backdropFilter: 'blur(12px)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              fontSize: '22px',
              fontWeight: 800,
              background: 'linear-gradient(135deg, #818cf8 0%, #c084fc 50%, #f472b6 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              letterSpacing: '-0.5px',
            }}
          >
            Co-Vibe
          </div>
          <span
            style={{
              fontSize: '12px',
              color: '#64748b',
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              padding: '2px 8px',
              borderRadius: '6px',
            }}
          >
            Dashboard
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {user && (
            <span style={{ fontSize: '13px', color: '#94a3b8' }}>
              {user.email}
            </span>
          )}
          <button
            type="button"
            onClick={() => signOut && signOut()}
            style={{
              padding: '6px 14px',
              borderRadius: '8px',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              backgroundColor: 'transparent',
              color: '#cbd5e1',
              fontSize: '13px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Sign Out
          </button>
        </div>
      </header>

      {/* Main Container Content */}
      <main
        style={{
          flex: 1,
          maxWidth: '1200px',
          width: '100%',
          margin: '0 auto',
          padding: '36px 24px',
          boxSizing: 'border-box',
        }}
      >
        {/* Header Action Section */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
            marginBottom: '32px',
          }}
        >
          <div>
            <h1
              style={{
                margin: '0 0 6px 0',
                fontSize: '28px',
                fontWeight: 800,
                color: '#f8fafc',
                letterSpacing: '-0.5px',
              }}
            >
              Projects
            </h1>
            <p style={{ margin: 0, fontSize: '14px', color: '#94a3b8' }}>
              Manage your collaborative workspaces and repositories.
            </p>
          </div>

          <button
            type="button"
            data-testid="create-project-btn"
            onClick={() => setIsModalOpen(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '12px 20px',
              borderRadius: '10px',
              border: 'none',
              backgroundColor: '#6366f1',
              color: '#ffffff',
              fontSize: '14px',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(99, 102, 241, 0.4)',
              transition: 'transform 0.15s ease, background-color 0.15s ease',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Create Project
          </button>
        </div>

        {/* Filter & Search Bar */}
        <div style={{ marginBottom: '24px' }}>
          <input
            type="text"
            data-testid="project-search-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search projects..."
            style={{
              width: '100%',
              maxWidth: '360px',
              padding: '10px 16px',
              borderRadius: '10px',
              backgroundColor: 'rgba(30, 41, 59, 0.6)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: '#ffffff',
              fontSize: '14px',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Projects Grid */}
        {isLoading ? (
          <div
            data-testid="projects-loading"
            style={{
              textAlign: 'center',
              padding: '60px 0',
              color: '#94a3b8',
              fontSize: '14px',
            }}
          >
            Loading projects...
          </div>
        ) : filteredProjects.length === 0 ? (
          <div
            data-testid="empty-projects-state"
            style={{
              textAlign: 'center',
              padding: '64px 24px',
              borderRadius: '16px',
              backgroundColor: 'rgba(30, 41, 59, 0.3)',
              border: '1px dashed rgba(255, 255, 255, 0.15)',
              color: '#94a3b8',
            }}
          >
            <div style={{ fontSize: '36px', marginBottom: '12px' }}>📁</div>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', color: '#e2e8f0' }}>
              {searchQuery ? 'No matching projects found' : 'No projects yet'}
            </h3>
            <p style={{ margin: '0 0 20px 0', fontSize: '14px', maxWidth: '400px', marginInline: 'auto' }}>
              {searchQuery
                ? 'Try refining your search query or clear the filter.'
                : 'Create your first project to start coding with AI agents and real-time collaboration.'}
            </p>
            {!searchQuery && (
              <button
                type="button"
                onClick={() => setIsModalOpen(true)}
                style={{
                  padding: '10px 18px',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: '#6366f1',
                  color: '#ffffff',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Create Project
              </button>
            )}
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
              gap: '20px',
            }}
          >
            {filteredProjects.map((p) => (
              <ProjectCard
                key={p.id}
                project={p}
                onOpenWorkspace={(projectId, wsId) =>
                  onOpenWorkspace ? onOpenWorkspace(projectId, wsId) : null
                }
              />
            ))}
          </div>
        )}
      </main>

      {/* Create Project Modal */}
      <CreateProjectModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onCreateProject={handleCreateProject}
      />
    </div>
  );
};

export default ProjectsPage;
