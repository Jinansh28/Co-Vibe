import React, { useState } from 'react';
import { TopBar } from './TopBar.js';
import { Sidebar } from './Sidebar.js';
import { EditorPane } from './EditorPane.js';
import { AgentPanel } from './AgentPanel.js';
import { TerminalPane } from './TerminalPane.js';

interface AppLayoutProps {
  workspaceId?: string | null;
  initialSidebarOpen?: boolean;
  initialTerminalOpen?: boolean;
  initialAgentOpen?: boolean;
  onBackToDashboard?: () => void;
}

export const AppLayout: React.FC<AppLayoutProps> = ({
  workspaceId,
  initialSidebarOpen = true,
  initialTerminalOpen = true,
  initialAgentOpen = true,
  onBackToDashboard,
}) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(initialSidebarOpen);
  const [isTerminalOpen, setIsTerminalOpen] = useState(initialTerminalOpen);
  const [isAgentOpen, setIsAgentOpen] = useState(initialAgentOpen);

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'var(--bg-app)',
        color: 'var(--text-primary)',
        overflow: 'hidden',
      }}
    >
      {/* Top Header Toolbar */}
      <TopBar
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
        isTerminalOpen={isTerminalOpen}
        onToggleTerminal={() => setIsTerminalOpen((prev) => !prev)}
        isAgentOpen={isAgentOpen}
        onToggleAgent={() => setIsAgentOpen((prev) => !prev)}
        onBackToDashboard={onBackToDashboard}
      />

      {/* Main Content Area (Sidebar + Editor + Agent Panel) */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'row',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {/* Left Explorer Sidebar */}
        <Sidebar isOpen={isSidebarOpen} />

        {/* Central Editor Surface */}
        <EditorPane workspaceId={workspaceId} />

        {/* Right AI Agent Drawer */}
        <AgentPanel
          isOpen={isAgentOpen}
          onClose={() => setIsAgentOpen(false)}
        />
      </div>

      {/* Bottom Terminal Drawer */}
      <TerminalPane
        isOpen={isTerminalOpen}
        onClose={() => setIsTerminalOpen(false)}
      />
    </div>
  );
};

export default AppLayout;
