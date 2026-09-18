import React, { useState } from 'react';
import { TopBar } from './TopBar.js';
import { Sidebar } from './Sidebar.js';
import { EditorPane } from './EditorPane.js';
import { AgentPanel } from './AgentPanel.js';
import { TerminalPane } from './TerminalPane.js';

interface AppLayoutProps {
  initialSidebarOpen?: boolean;
  initialTerminalOpen?: boolean;
  initialAgentOpen?: boolean;
  onBackToDashboard?: () => void;
}

export const AppLayout: React.FC<AppLayoutProps> = ({
  initialSidebarOpen = true,
  initialTerminalOpen = true,
  initialAgentOpen = true,
  onBackToDashboard,
}) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(initialSidebarOpen);
  const [isTerminalOpen, setIsTerminalOpen] = useState(initialTerminalOpen);
  const [isAgentOpen, setIsAgentOpen] = useState(initialAgentOpen);
  const [activeFilePath, setActiveFilePath] = useState('src/App.tsx');

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
        <Sidebar
          isOpen={isSidebarOpen}
          activeFilePath={activeFilePath}
          onSelectFile={(filePath) => setActiveFilePath(filePath)}
        />

        {/* Central Editor Surface */}
        <EditorPane
          activeFilePath={activeFilePath}
          onCloseTab={() => setActiveFilePath('')}
        />

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
