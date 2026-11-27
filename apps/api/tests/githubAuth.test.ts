import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { sign } from 'hono/jwt';
import app from '../src/index.js';
import {
  encryptGithubToken,
  decryptGithubToken,
  resolveGithubEncryptionKey,
  inMemoryGithubTokenService,
} from '../src/services/githubTokenService.js';
import { inMemoryProjectService } from '../src/services/projectService.js';

const SECRET = 'dev-secret-key-change-in-prod';

describe('GitHub OAuth & AES-256-GCM Token Vault (AUTH-03)', () => {
  let userToken: string;
  const userSub = 'gh-user-001';
  const userEmail = 'gh-user@co-vibe.dev';
  const originalFetch = globalThis.fetch;

  beforeEach(async () => {
    inMemoryGithubTokenService.reset();
    inMemoryProjectService.reset();
    const exp = Math.floor(Date.now() / 1000) + 3600;
    userToken = await sign({ sub: userSub, email: userEmail, exp }, SECRET, 'HS256');
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('encrypts and decrypts GitHub tokens using Web Crypto AES-256-GCM', async () => {
    const rawToken = 'ghp_superSecretTokenValue1234567890';
    const key = 'test-32-byte-aes-gcm-vault-secret!';

    const encrypted = await encryptGithubToken(rawToken, key);
    expect(encrypted.encryptedToken).not.toBe(rawToken);
    expect(encrypted.encryptedToken).not.toContain(rawToken);
    expect(encrypted.iv.length).toBeGreaterThan(0);
    expect(encrypted.authTag.length).toBeGreaterThan(0);

    const decrypted = await decryptGithubToken(encrypted, key);
    expect(decrypted).toBe(rawToken);

    // Wrong key fails authentication tag verification
    await expect(decryptGithubToken(encrypted, 'wrong-key')).rejects.toThrow();
  });

  it('fails closed in production when GITHUB_TOKEN_ENCRYPTION_KEY is missing', () => {
    expect(() => resolveGithubEncryptionKey({ ENVIRONMENT: 'production' })).toThrow(
      'Missing GITHUB_TOKEN_ENCRYPTION_KEY'
    );
  });

  it('exchanges OAuth code, stores encrypted token server-side, and never leaks raw token in any API response (AUTH-03)', async () => {
    const leakedSecret = 'gho_NeverLeakThisTokenToBrowser987654';
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('github.com/login/oauth/access_token')) {
        return new Response(
          JSON.stringify({
            access_token: leakedSecret,
            scope: 'repo read:user',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (url.includes('api.github.com/user')) {
        return new Response(JSON.stringify({ login: 'dev-octocat' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`Unexpected fetch URL: ${url}`);
    }) as any;

    const authzRes = await app.request(
      '/api/v1/auth/github/authorize',
      { headers: { Authorization: `Bearer ${userToken}` } },
      { GITHUB_CLIENT_ID: 'gh-client-123' } as any
    );
    expect(authzRes.status).toBe(200);
    const authzBody = (await authzRes.json()) as Record<string, any>;
    expect(authzBody.url).toContain('https://github.com/login/oauth/authorize');
    expect(authzBody.url).toContain('client_id=gh-client-123');

    const callbackRes = await app.request(
      '/api/v1/auth/github/callback',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${userToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code: 'oauth-code-abc' }),
      },
      {
        GITHUB_CLIENT_ID: 'gh-client-123',
        GITHUB_CLIENT_SECRET: 'gh-secret-xyz',
        GITHUB_TOKEN_ENCRYPTION_KEY: 'vault-key-123',
      } as any
    );

    expect(callbackRes.status).toBe(200);
    const callbackText = await callbackRes.text();
    expect(callbackText).not.toContain(leakedSecret);
    const callbackBody = JSON.parse(callbackText);
    expect(callbackBody).toEqual({
      ok: true,
      connected: true,
      githubUsername: 'dev-octocat',
      scope: 'repo read:user',
    });

    // Status check must never leak token
    const statusRes = await app.request('/api/v1/auth/github/status', {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    expect(statusRes.status).toBe(200);
    const statusText = await statusRes.text();
    expect(statusText).not.toContain(leakedSecret);
    expect(JSON.parse(statusText)).toEqual({
      connected: true,
      githubUsername: 'dev-octocat',
      scope: 'repo read:user',
    });

    // Project endpoints must never leak token
    const projRes = await app.request('/api/v1/projects', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${userToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Private Clone Project',
        repoUrl: 'https://github.com/dev-octocat/private-app',
      }),
    });
    expect(projRes.status).toBe(201);
    const projText = await projRes.text();
    expect(projText).not.toContain(leakedSecret);

    // Server-side decryption retrieves the token for git operations
    const decrypted = await inMemoryGithubTokenService.getDecryptedToken(userSub, {
      GITHUB_TOKEN_ENCRYPTION_KEY: 'vault-key-123',
    } as any);
    expect(decrypted).toBe(leakedSecret);

    // Disconnect removes token
    const deleteRes = await app.request('/api/v1/auth/github', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${userToken}` },
    });
    expect(deleteRes.status).toBe(200);
    expect(await inMemoryGithubTokenService.getStatus(userSub)).toEqual({ connected: false });
  });
});
