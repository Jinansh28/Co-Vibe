export { MonacoEditor } from './MonacoEditor.js';
export type { MonacoEditorProps } from './MonacoEditor.js';
export {
  DEFAULT_EDITOR_OPTIONS,
  EXTENSION_TO_LANGUAGE_MAP,
  getLanguageFromPath,
} from './editorConfig.js';
export type { EditorSettings } from './editorConfig.js';
export { QuickOpenModal } from './QuickOpenModal.js';
export type { QuickOpenModalProps } from './QuickOpenModal.js';
export { fuzzyFilterFiles, splitPath, isWordBoundary } from './fuzzySearch.js';
export type { FuzzyMatchResult } from './fuzzySearch.js';
export { flattenFileTree } from './useFiles.js';

