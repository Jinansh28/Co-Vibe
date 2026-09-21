import type { MiddlewareHandler } from 'hono';
import type { Env } from './auth.js';
import { auditService } from '../services/auditService.js';

export const auditMiddleware: MiddlewareHandler<Env> = async (c, next) => {
  await next();

  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(c.req.method)) {
    if (c.res.status >= 200 && c.res.status < 300) {
      const authUser = c.get('authUser');
      const userId = authUser?.sub;
      const url = new URL(c.req.url);
      const path = url.pathname;

      let eventType = 'mutation';
      let targetType = 'unknown';
      let targetId: string | undefined = undefined;
      let projectId: string | undefined = undefined;
      let workspaceId: string | undefined = undefined;

      try {
        const resClone = c.res.clone();
        const body = (await resClone.json()) as any;

        if (path === '/api/v1/projects' && c.req.method === 'POST') {
          eventType = 'project.created';
          targetType = 'project';
          if (body.project) {
            targetId = body.project.id;
            projectId = body.project.id;
          }
        } else if (path.match(/^\/api\/v1\/projects\/[^/]+\/workspaces$/) && c.req.method === 'POST') {
          eventType = 'workspace.started';
          targetType = 'workspace';
          if (body.workspace) {
            targetId = body.workspace.id;
            workspaceId = body.workspace.id;
            projectId = body.workspace.projectId;
          }
        } else if (path.match(/^\/api\/v1\/changesets\/[^/]+\/accept$/) && c.req.method === 'POST') {
          eventType = 'changeset.accepted';
          targetType = 'changeset';
          // targetId would be changeset id
          const match = path.match(/^\/api\/v1\/changesets\/([^/]+)\/accept$/);
          if (match) targetId = match[1];
        }

        auditService.logEvent({
          userId,
          eventType,
          targetType,
          targetId,
          projectId,
          workspaceId,
          metadata: { path, method: c.req.method }
        });
      } catch (_err) {
        // Ignore parsing errors for responses without JSON
      }
    }
  }
};
