import type { editor } from 'monaco-editor';

export interface EditorSettings {
  fontSize?: number;
  minimap?: { enabled: boolean };
  lineNumbers?: editor.LineNumbersType;
  wordWrap?: 'on' | 'off' | 'wordWrapColumn' | 'bounded';
  tabSize?: number;
  theme?: string;
  automaticLayout?: boolean;
}

export const DEFAULT_EDITOR_OPTIONS: editor.IStandaloneEditorConstructionOptions = {
  fontSize: 14,
  fontFamily: "'JetBrains Mono', 'Fira Code', 'Menlo', 'Monaco', 'Courier New', monospace",
  lineNumbers: 'on',
  minimap: {
    enabled: true,
  },
  automaticLayout: true,
  tabSize: 2,
  scrollBeyondLastLine: false,
  wordWrap: 'off',
  theme: 'vs-dark',
  padding: {
    top: 12,
    bottom: 12,
  },
  smoothScrolling: true,
  cursorBlinking: 'smooth',
  renderWhitespace: 'selection',
  bracketPairColorization: {
    enabled: true,
  },
};

export const EXTENSION_TO_LANGUAGE_MAP: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  json: 'json',
  html: 'html',
  htm: 'html',
  css: 'css',
  scss: 'css',
  less: 'css',
  md: 'markdown',
  markdown: 'markdown',
  py: 'python',
  yaml: 'yaml',
  yml: 'yaml',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  sql: 'sql',
  xml: 'xml',
  svg: 'xml',
  dockerfile: 'dockerfile',
};

export function getLanguageFromPath(filePath?: string): string {
  if (!filePath) return 'plaintext';
  const cleanPath = filePath.trim();
  const fileName = cleanPath.split('/').pop() || cleanPath;
  if (fileName.toLowerCase() === 'dockerfile') return 'dockerfile';
  const dotIndex = fileName.lastIndexOf('.');
  if (dotIndex === -1) return 'plaintext';
  const ext = fileName.slice(dotIndex + 1).toLowerCase();
  return EXTENSION_TO_LANGUAGE_MAP[ext] || 'plaintext';
}
