import { useEffect, useRef, useState } from 'react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { YjsMonacoAdapter, AwarenessManager } from '@co-vibe/collaboration';
import type { editor } from 'monaco-editor';
import { useAuth } from '../auth/useAuth.js';

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
  const [synced, setSynced] = useState(false);

  const { session } = useAuth();
  const token = session?.access_token;

  useEffect(() => {
    if (!workspaceId || !token) return;

    const doc = new Y.Doc();
    docRef.current = doc;

    const wsUrl = `ws://localhost:8787`; 
    const tokenQuery = `?token=${token}`;

    const provider = new WebsocketProvider(
      `${wsUrl}/api/v1/workspaces`,
      `${workspaceId}/room${tokenQuery}`,
      doc,
      { connect: true }
    );
    providerRef.current = provider;

    provider.on('status', (event: { status: string }) => {
      setConnected(event.status === 'connected');
    });

    provider.on('sync', (isSynced: boolean) => {
      setSynced(isSynced);
    });

    const awareness = provider.awareness;
    const awarenessManager = new AwarenessManager(awareness);
    awarenessManager.setLocalState(userState);
    awarenessManagerRef.current = awarenessManager;

    return () => {
      provider.disconnect();
      doc.destroy();
    };
  }, [workspaceId, token]);

  useEffect(() => {
    if (!docRef.current || !filePath || !editorInstance || !awarenessManagerRef.current || !synced) {
      return;
    }

    const yMap = docRef.current.getMap('files');
    
    const initializeBinding = (yText: Y.Text) => {
      // If we are re-binding, destroy the old one
      if (bindingRef.current) {
        bindingRef.current.destroy();
      }
      
      const binding = new YjsMonacoAdapter(
        yText,
        editorInstance,
        awarenessManagerRef.current!.getAwareness()
      );
      binding.bind();
      bindingRef.current = binding;
    };

    if (!yMap.has(filePath)) {
      // Create empty first to avoid race conditions with other tabs
      const yText = new Y.Text();
      yMap.set(filePath, yText);
      
      const headers: Record<string, string> = {};
      if (workspaceId) headers['X-Workspace-Id'] = workspaceId;

      // Fetch content from local runtime
      fetch(`http://127.0.0.1:7890/api/v1/files/content?path=${encodeURIComponent(filePath)}`, { headers })
        .then(res => res.json())
        .then(data => {
          if (data.ok && typeof data.content === 'string') {
            // Check if it's still empty, to prevent overwriting collaborative changes that might have happened during fetch
            if (yText.length === 0) {
              yText.insert(0, data.content);
            }
          }
          initializeBinding(yText);
        })
        .catch(err => {
          console.error('Failed to load file content:', err);
          initializeBinding(yText);
        });
    } else {
      const yText = yMap.get(filePath) as Y.Text;
      initializeBinding(yText);
    }

    return () => {
      if (bindingRef.current) {
        bindingRef.current.destroy();
        bindingRef.current = null;
      }
    };
  }, [filePath, editorInstance]);

  return { connected };
}
