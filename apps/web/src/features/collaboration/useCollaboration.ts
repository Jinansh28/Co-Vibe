import { useEffect, useRef, useState } from 'react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { YjsMonacoAdapter, AwarenessManager } from '@co-vibe/collaboration';
import type { editor } from 'monaco-editor';

export function useCollaboration(
  workspaceId: string,
  filePath: string | null,
  editorInstance: editor.IStandaloneCodeEditor | null,
  userState: { name: string; color: string }
) {
  const docRef = useRef<Y.Doc | null>(null);
  const providerRef = useRef<WebsocketProvider | null>(null);
  const bindingRef = useRef<YjsMonacoAdapter | null>(null);
  const awarenessManagerRef = useRef<AwarenessManager | null>(null);

  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!workspaceId) return;

    const doc = new Y.Doc();
    docRef.current = doc;

    // Use current origin for WebSocket connection, assuming the API runs on the same domain or a specific port.
    // In a real implementation this should use the environment configuration.
    const wsUrl = `ws://localhost:8787`; 
    // Wait, the API might be on port 8787 or similar. 

    const provider = new WebsocketProvider(
      `${wsUrl}/ws/workspace/${workspaceId}`,
      workspaceId,
      doc,
      { connect: true }
    );
    providerRef.current = provider;

    provider.on('status', (event: { status: string }) => {
      setConnected(event.status === 'connected');
    });

    const awareness = provider.awareness;
    const awarenessManager = new AwarenessManager(awareness);
    awarenessManager.setLocalState(userState);
    awarenessManagerRef.current = awarenessManager;

    return () => {
      provider.disconnect();
      doc.destroy();
    };
  }, [workspaceId]);

  // Bind the editor to the active file's Y.Text whenever filePath or editorInstance changes
  useEffect(() => {
    if (!docRef.current || !filePath || !editorInstance || !awarenessManagerRef.current) {
      return;
    }

    const yMap = docRef.current.getMap('files');
    
    // Yjs Map doesn't create sub-types automatically if they don't exist.
    // However, for distributed consistency, if multiple clients try to create it, Yjs handles it.
    if (!yMap.has(filePath)) {
      yMap.set(filePath, new Y.Text());
    }
    
    const yText = yMap.get(filePath) as Y.Text;

    const binding = new YjsMonacoAdapter(
      yText,
      editorInstance,
      awarenessManagerRef.current.getAwareness()
    );
    binding.bind();
    bindingRef.current = binding;

    return () => {
      binding.destroy();
      bindingRef.current = null;
    };
  }, [filePath, editorInstance]);

  return { connected };
}
