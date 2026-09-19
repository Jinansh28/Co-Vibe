import { create } from 'zustand';

interface EditorState {
  openFiles: string[];
  activeFilePath: string | null;
  openFile: (filePath: string) => void;
  closeFile: (filePath: string) => void;
  setActiveFile: (filePath: string) => void;
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
}));
