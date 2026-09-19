import * as Y from 'yjs';
import { MonacoBinding } from 'y-monaco';
import type { editor } from 'monaco-editor';
import { Awareness } from 'y-protocols/awareness';

export class YjsMonacoAdapter {
  private binding: MonacoBinding | null = null;
  private yText: Y.Text;
  private editorInstance: editor.IStandaloneCodeEditor;
  private awareness: Awareness;

  constructor(
    yText: Y.Text,
    editorInstance: editor.IStandaloneCodeEditor,
    awareness: Awareness
  ) {
    this.yText = yText;
    this.editorInstance = editorInstance;
    this.awareness = awareness;
  }

  public bind() {
    const model = this.editorInstance.getModel();
    if (!model) {
      throw new Error('Monaco editor instance does not have a model attached.');
    }

    this.binding = new MonacoBinding(
      this.yText,
      model,
      new Set([this.editorInstance]),
      this.awareness
    );
  }

  public destroy() {
    if (this.binding) {
      this.binding.destroy();
      this.binding = null;
    }
  }
}
