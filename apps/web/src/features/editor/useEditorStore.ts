import { create } from 'zustand';

export interface CursorNavigationTarget {
  filePath: string;
  line: number;
  column: number;
  timestamp: number;
}

interface EditorState {
  openFiles: string[];
  activeFilePath: string | null;
  openFile: (filePath: string) => void;
  closeFile: (filePath: string) => void;
  setActiveFile: (filePath: string) => void;
  saveActiveFile: (() => Promise<void>) | null;
  registerSaveHandler: (handler: (() => Promise<void>) | null) => void;
  getActiveContent: (() => string) | null;
  registerGetActiveContent: (getter: (() => string) | null) => void;
  updateActiveContent: ((content: string) => void) | null;
  registerUpdateActiveContent: (updater: ((content: string) => void) | null) => void;
  pendingCursor: CursorNavigationTarget | null;
  navigateToPosition: (filePath: string, line: number, column?: number) => void;
  clearPendingCursor: () => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  openFiles: [],
  activeFilePath: null,
  openFile: (filePath) => set((state) => {
    const isAlreadyOpen = state.openFiles.includes(filePath);
    return {
      openFiles: isAlreadyOpen ? state.openFiles : [...state.openFiles, filePath],
      activeFilePath: filePath,
    };
  }),
  closeFile: (filePath) => set((state) => {
    const newOpenFiles = state.openFiles.filter((f) => f !== filePath);
    let newActiveFilePath = state.activeFilePath;
    if (state.activeFilePath === filePath) {
      // Pick another active file
      newActiveFilePath = newOpenFiles.length > 0 ? newOpenFiles[newOpenFiles.length - 1] : null;
    }
    return {
      openFiles: newOpenFiles,
      activeFilePath: newActiveFilePath,
    };
  }),
  setActiveFile: (filePath) => set({ activeFilePath: filePath }),
  saveActiveFile: null,
  registerSaveHandler: (handler) => set({ saveActiveFile: handler }),
  getActiveContent: null,
  registerGetActiveContent: (getter) => set({ getActiveContent: getter }),
  updateActiveContent: null,
  registerUpdateActiveContent: (updater) => set({ updateActiveContent: updater }),
  pendingCursor: null,
  navigateToPosition: (filePath, line, column = 1) => set((state) => {
    const isAlreadyOpen = state.openFiles.includes(filePath);
    return {
      openFiles: isAlreadyOpen ? state.openFiles : [...state.openFiles, filePath],
      activeFilePath: filePath,
      pendingCursor: { filePath, line, column, timestamp: Date.now() },
    };
  }),
  clearPendingCursor: () => set({ pendingCursor: null }),
}));
