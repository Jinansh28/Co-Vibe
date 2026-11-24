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
export { useDiagnosticsStore, extractDiagnosticsFromMarkers, syncMonacoMarkers } from './useDiagnosticsStore.js';
export type { DiagnosticItem, DiagnosticsState } from './useDiagnosticsStore.js';
export { ProblemsView } from './ProblemsView.js';
export type { ProblemsViewProps } from './ProblemsView.js';


