import { DurableObject } from 'cloudflare:workers';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync.js';
import * as encoding from 'lib0/encoding.js';
import * as decoding from 'lib0/decoding.js';

export class WorkspaceRoom extends DurableObject {
  private doc: Y.Doc;
  private sessions: Set<WebSocket>;

  constructor(ctx: DurableObjectState, env: any) {
    super(ctx, env);
    this.doc = new Y.Doc();
    this.sessions = new Set();
    
    this.ctx.blockConcurrencyWhile(async () => {
      const stored = await this.ctx.storage.get<Uint8Array>('docState');
      if (stored) {
        Y.applyUpdate(this.doc, stored);
      }
    });
  }

  async fetch(request: Request): Promise<Response> {
    const upgradeHeader = request.headers.get('Upgrade');
    if (!upgradeHeader || upgradeHeader !== 'websocket') {
      return new Response('Expected Upgrade: websocket', { status: 426 });
    }

    const [client, server] = Object.values(new WebSocketPair());

    this.ctx.acceptWebSocket(server);
    this.sessions.add(server);

    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, 0); // messageSync
    syncProtocol.writeSyncStep1(encoder, this.doc);
    server.send(encoding.toUint8Array(encoder));

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  webSocketMessage(ws: WebSocket, message: ArrayBuffer | string) {
    if (typeof message === 'string') return;

    try {
      const decoder = decoding.createDecoder(new Uint8Array(message as ArrayBuffer));
      const messageType = decoding.readVarUint(decoder);

      if (messageType === 0) { // messageSync
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, 0); // messageSync
        const syncMessageType = syncProtocol.readSyncMessage(decoder, encoder, this.doc, null);
        
        if (encoding.length(encoder) > 1) { 
          ws.send(encoding.toUint8Array(encoder));
        }

        if (syncMessageType === syncProtocol.messageYjsSyncStep2 || syncMessageType === syncProtocol.messageYjsUpdate) {
          for (const session of this.sessions) {
            if (session !== ws) {
              session.send(message);
            }
          }
          const state = Y.encodeStateAsUpdate(this.doc);
          this.ctx.storage.put('docState', state);
        }
      } else if (messageType === 1 || messageType === 2) { 
        // Broadcast awareness (1) or other protocol messages to all other clients
        for (const session of this.sessions) {
          if (session !== ws) {
            session.send(message);
          }
        }
      }
    } catch (e) {
      console.error('Yjs sync error', e);
    }
  }

  webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean) {
    this.sessions.delete(ws);
  }
  
  webSocketError(ws: WebSocket, error: unknown) {
    this.sessions.delete(ws);
  }
}
