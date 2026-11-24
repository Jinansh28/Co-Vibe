import { create } from 'zustand';

export interface DiagnosticItem {
  id: string;
  filePath: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
  code?: string;
  source?: string;
}

export interface DiagnosticsState {
  diagnostics: DiagnosticItem[];
  setDiagnostics: (items: DiagnosticItem[]) => void;
  clearDiagnostics: () => void;
}

export const useDiagnosticsStore = create<DiagnosticsState>((set) => ({
  diagnostics: [],
  setDiagnostics: (items) => set({ diagnostics: items }),
  clearDiagnostics: () => set({ diagnostics: [] }),
}));

/**
 * Normalizes raw Monaco markers into DiagnosticItem structures,
 * filtering out low-severity hints (severity 1).
 *
 * Monaco MarkerSeverity:
 * Hint = 1, Info = 2, Warning = 4, Error = 8
 */
export function extractDiagnosticsFromMarkers(markers: any[]): DiagnosticItem[] {
  if (!Array.isArray(markers)) return [];

  return markers
    .filter((m) => {
      // Keep only Info (2), Warning (4), Error (8); filter out Hint (1)
      return m && (m.severity === 8 || m.severity === 4 || m.severity === 2);
    })
    .map((m) => {
      let severity: 'error' | 'warning' | 'info' = 'info';
      if (m.severity === 8) severity = 'error';
      else if (m.severity === 4) severity = 'warning';

      // Normalize file path from resource Uri or string
      let filePath = m.resource?.path || m.filePath || '';
      if (typeof filePath === 'string') {
        if (filePath.startsWith('/')) {
          filePath = filePath.substring(1);
        }
      } else {
        filePath = String(filePath);
      }

      const rawCode =
        typeof m.code === 'object' && m.code !== null
          ? (m.code as any).value
          : m.code !== undefined && m.code !== null
            ? String(m.code)
            : undefined;

      // Format code as ts(code) if numeric or ts-based, else raw
      let formattedCode = rawCode;
      if (rawCode && /^\d+$/.test(rawCode)) {
        formattedCode = `ts(${rawCode})`;
      }

      const id = `${filePath}:${m.startLineNumber}:${m.startColumn}:${rawCode || ''}:${m.message}`;

      return {
        id,
        filePath,
        message: m.message || '',
        severity,
        startLineNumber: Number(m.startLineNumber) || 1,
        startColumn: Number(m.startColumn) || 1,
        endLineNumber: Number(m.endLineNumber) || Number(m.startLineNumber) || 1,
        endColumn: Number(m.endColumn) || Number(m.startColumn) || 1,
        code: formattedCode,
        source: m.source,
      };
    });
}

/**
 * Extracts all model markers from Monaco and synchronizes them into useDiagnosticsStore.
 */
export function syncMonacoMarkers(monacoInstance: any): void {
  if (!monacoInstance?.editor?.getModelMarkers) return;
  try {
    const rawMarkers = monacoInstance.editor.getModelMarkers({});
    const items = extractDiagnosticsFromMarkers(rawMarkers);
    useDiagnosticsStore.getState().setDiagnostics(items);
  } catch (err) {
    console.error('Error synchronizing Monaco markers:', err);
  }
}
