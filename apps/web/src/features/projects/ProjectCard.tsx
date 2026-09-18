import React from 'react';

export interface ProjectCardData {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  role?: 'owner' | 'editor' | 'viewer';
  workspaceCount?: number;
  activeWorkspaceId?: string;
}

interface ProjectCardProps {
  project: ProjectCardData;
  onOpenWorkspace: (projectId: string, workspaceId?: string) => void;
}

export const ProjectCard: React.FC<ProjectCardProps> = ({ project, onOpenWorkspace }) => {
  const formattedDate = project.createdAt
    ? new Date(project.createdAt).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : 'Recent';

  const roleColor =
    project.role === 'owner'
      ? '#818cf8'
      : project.role === 'editor'
        ? '#34d399'
        : '#94a3b8';

  return (
    <div
      data-testid={`project-card-${project.id}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '20px',
        borderRadius: '14px',
        backgroundColor: 'rgba(30, 41, 59, 0.65)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.25)',
        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        minHeight: '180px',
      }}
    >
      <div>
        {/* Header: Title & Role Badge */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            marginBottom: '10px',
            gap: '12px',
          }}
        >
          <h3
            style={{
              margin: 0,
              fontSize: '17px',
              fontWeight: 700,
              color: '#f8fafc',
              wordBreak: 'break-word',
              letterSpacing: '-0.3px',
            }}
          >
            {project.name}
          </h3>
          {project.role && (
            <span
              style={{
                fontSize: '11px',
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: '12px',
                backgroundColor: `${roleColor}20`,
                color: roleColor,
                border: `1px solid ${roleColor}40`,
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                whiteSpace: 'nowrap',
              }}
            >
              {project.role}
            </span>
          )}
        </div>

        {/* Description */}
        <p
          style={{
            margin: '0 0 16px 0',
            fontSize: '13px',
            color: '#94a3b8',
            lineHeight: 1.5,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            minHeight: '38px',
          }}
        >
          {project.description || 'No description provided.'}
        </p>
      </div>

      {/* Footer: Metadata & Action */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingTop: '14px',
          borderTop: '1px solid rgba(255, 255, 255, 0.06)',
          fontSize: '12px',
          color: '#64748b',
        }}
      >
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <span>Created {formattedDate}</span>
          {typeof project.workspaceCount === 'number' && (
            <span>• {project.workspaceCount} workspace{project.workspaceCount === 1 ? '' : 's'}</span>
          )}
        </div>

        <button
          type="button"
          onClick={() => onOpenWorkspace(project.id, project.activeWorkspaceId)}
          aria-label={`Open workspace for ${project.name}`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 14px',
            borderRadius: '8px',
            border: 'none',
            backgroundColor: '#6366f1',
            color: '#ffffff',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'background-color 0.2s ease, transform 0.1s ease',
            boxShadow: '0 2px 8px rgba(99, 102, 241, 0.35)',
          }}
        >
          Open Workspace
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 12h14" />
            <path d="M12 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default ProjectCard;
