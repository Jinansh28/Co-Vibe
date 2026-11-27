import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { isDevOrTestEnvironment, type Env } from '../middleware/auth.js';
import { getProjectService } from './projectService.js';

export const DEV_GITHUB_ENCRYPTION_FALLBACK = 'dev-github-token-encryption-key-change-in-prod';

export interface EncryptedTokenPayload {
  encryptedToken: string;
  iv: string;
  authTag: string;
}

export interface GithubConnectionStatus {
  connected: boolean;
  githubUsername?: string;
  scope?: string;
}

function isTableMissingError(err: any): boolean {
  if (!err) return false;
  return (
    err.code === 'PGRST205' ||
    (typeof err.message === 'string' &&
      (err.message.includes('PGRST205') || err.message.includes('Could not find the table')))
  );
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function resolveGithubEncryptionKey(env?: Env['Bindings']): string {
  const configured =
    env?.GITHUB_TOKEN_ENCRYPTION_KEY?.trim() ||
    (typeof process !== 'undefined' ? process.env?.GITHUB_TOKEN_ENCRYPTION_KEY?.trim() : undefined);

  if (!configured) {
    if (isDevOrTestEnvironment(env)) {
      return DEV_GITHUB_ENCRYPTION_FALLBACK;
    }
    throw new Error('Missing GITHUB_TOKEN_ENCRYPTION_KEY in non-dev/non-test environment');
  }

  if (configured === DEV_GITHUB_ENCRYPTION_FALLBACK && !isDevOrTestEnvironment(env)) {
    throw new Error('Insecure fallback GITHUB_TOKEN_ENCRYPTION_KEY configured in non-dev/non-test environment');
  }

  return configured;
}

async function deriveAesKey(secret: string, usages: KeyUsage[]): Promise<CryptoKey> {
  const rawBytes = new TextEncoder().encode(secret);
  const digest = await crypto.subtle.digest('SHA-256', rawBytes);
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, usages);
}

export async function encryptGithubToken(
  plaintextToken: string,
  secret: string
): Promise<EncryptedTokenPayload> {
  const key = await deriveAesKey(secret, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(12)));
  const encoded = new TextEncoder().encode(plaintextToken);
  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, tagLength: 128 },
    key,
    encoded
  );

  const encryptedBytes = new Uint8Array(encryptedBuffer);
  const tagLengthBytes = 16;
  const ciphertext = encryptedBytes.slice(0, encryptedBytes.length - tagLengthBytes);
  const authTag = encryptedBytes.slice(encryptedBytes.length - tagLengthBytes);

  return {
    encryptedToken: toBase64(ciphertext),
    iv: toBase64(iv),
    authTag: toBase64(authTag),
  };
}

export async function decryptGithubToken(
  payload: EncryptedTokenPayload,
  secret: string
): Promise<string> {
  const key = await deriveAesKey(secret, ['decrypt']);
  const ciphertext = fromBase64(payload.encryptedToken);
  const iv = fromBase64(payload.iv);
  const authTag = fromBase64(payload.authTag);

  const combined = new Uint8Array(new ArrayBuffer(ciphertext.length + authTag.length));
  combined.set(ciphertext, 0);
  combined.set(authTag, ciphertext.length);

  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, tagLength: 128 },
    key,
    combined
  );

  return new TextDecoder().decode(decryptedBuffer);
}

export interface SaveGithubTokenInput {
  accessToken: string;
  githubUsername?: string;
  scope?: string;
}

export interface IGithubTokenService {
  reset(): void;
  saveToken(
    authUserId: string,
    email: string,
    input: SaveGithubTokenInput,
    env?: Env['Bindings']
  ): Promise<GithubConnectionStatus>;
  getStatus(authUserId: string): Promise<GithubConnectionStatus>;
  getDecryptedToken(authUserId: string, env?: Env['Bindings']): Promise<string | null>;
  deleteToken(authUserId: string): Promise<void>;
}

interface StoredRecord {
  userId: string;
  githubUsername?: string;
  scope?: string;
  encryptedToken: string;
  iv: string;
  authTag: string;
}

export class InMemoryGithubTokenService implements IGithubTokenService {
  private records = new Map<string, StoredRecord>();

  public reset(): void {
    this.records.clear();
  }

  public async saveToken(
    authUserId: string,
    _email: string,
    input: SaveGithubTokenInput,
    env?: Env['Bindings']
  ): Promise<GithubConnectionStatus> {
    const key = resolveGithubEncryptionKey(env);
    const encrypted = await encryptGithubToken(input.accessToken, key);
    this.records.set(authUserId, {
      userId: authUserId,
      githubUsername: input.githubUsername,
      scope: input.scope,
      ...encrypted,
    });
    return {
      connected: true,
      githubUsername: input.githubUsername,
      scope: input.scope,
    };
  }

  public async getStatus(authUserId: string): Promise<GithubConnectionStatus> {
    const rec = this.records.get(authUserId);
    if (!rec) {
      return { connected: false };
    }
    return {
      connected: true,
      githubUsername: rec.githubUsername,
      scope: rec.scope,
    };
  }

  public async getDecryptedToken(authUserId: string, env?: Env['Bindings']): Promise<string | null> {
    const rec = this.records.get(authUserId);
    if (!rec) {
      return null;
    }
    const key = resolveGithubEncryptionKey(env);
    return decryptGithubToken(
      {
        encryptedToken: rec.encryptedToken,
        iv: rec.iv,
        authTag: rec.authTag,
      },
      key
    );
  }

  public async deleteToken(authUserId: string): Promise<void> {
    this.records.delete(authUserId);
  }
}

export class SupabaseGithubTokenService implements IGithubTokenService {
  private fallback = inMemoryGithubTokenService;

  constructor(
    private client: SupabaseClient,
    private env?: Env['Bindings']
  ) {}

  public reset(): void {
    this.fallback.reset();
  }

  public async saveToken(
    authUserId: string,
    email: string,
    input: SaveGithubTokenInput,
    env?: Env['Bindings']
  ): Promise<GithubConnectionStatus> {
    const effectiveEnv = env ?? this.env;
    const key = resolveGithubEncryptionKey(effectiveEnv);
    const encrypted = await encryptGithubToken(input.accessToken, key);

    const user = await getProjectService(effectiveEnv).getOrCreateUser(authUserId, email);
    const now = new Date().toISOString();

    const { error } = await this.client.from('github_oauth_tokens').upsert(
      {
        user_id: user.id,
        github_username: input.githubUsername ?? null,
        encrypted_token: encrypted.encryptedToken,
        iv: encrypted.iv,
        auth_tag: encrypted.authTag,
        scope: input.scope ?? null,
        updated_at: now,
      },
      { onConflict: 'user_id' }
    );

    if (isTableMissingError(error)) {
      return this.fallback.saveToken(authUserId, email, input, effectiveEnv);
    }
    if (error) {
      throw new Error(`Failed to persist encrypted GitHub token: ${error.message}`);
    }

    return {
      connected: true,
      githubUsername: input.githubUsername,
      scope: input.scope,
    };
  }

  public async getStatus(authUserId: string): Promise<GithubConnectionStatus> {
    const { data: userRow, error: uErr } = await this.client
      .from('users')
      .select('id')
      .eq('auth_user_id', authUserId)
      .maybeSingle();

    if (isTableMissingError(uErr)) {
      return this.fallback.getStatus(authUserId);
    }
    if (!userRow) {
      return { connected: false };
    }

    const { data, error } = await this.client
      .from('github_oauth_tokens')
      .select('github_username, scope')
      .eq('user_id', userRow.id)
      .maybeSingle();

    if (isTableMissingError(error)) {
      return this.fallback.getStatus(authUserId);
    }
    if (error || !data) {
      return { connected: false };
    }

    return {
      connected: true,
      githubUsername: data.github_username ?? undefined,
      scope: data.scope ?? undefined,
    };
  }

  public async getDecryptedToken(authUserId: string, env?: Env['Bindings']): Promise<string | null> {
    const effectiveEnv = env ?? this.env;
    const { data: userRow, error: uErr } = await this.client
      .from('users')
      .select('id')
      .eq('auth_user_id', authUserId)
      .maybeSingle();

    if (isTableMissingError(uErr)) {
      return this.fallback.getDecryptedToken(authUserId, effectiveEnv);
    }
    if (!userRow) {
      return null;
    }

    const { data, error } = await this.client
      .from('github_oauth_tokens')
      .select('encrypted_token, iv, auth_tag')
      .eq('user_id', userRow.id)
      .maybeSingle();

    if (isTableMissingError(error)) {
      return this.fallback.getDecryptedToken(authUserId, effectiveEnv);
    }
    if (error || !data) {
      return null;
    }

    const key = resolveGithubEncryptionKey(effectiveEnv);
    return decryptGithubToken(
      {
        encryptedToken: data.encrypted_token,
        iv: data.iv,
        authTag: data.auth_tag,
      },
      key
    );
  }

  public async deleteToken(authUserId: string): Promise<void> {
    const { data: userRow, error: uErr } = await this.client
      .from('users')
      .select('id')
      .eq('auth_user_id', authUserId)
      .maybeSingle();

    if (isTableMissingError(uErr)) {
      return this.fallback.deleteToken(authUserId);
    }
    if (!userRow) {
      return;
    }

    const { error } = await this.client
      .from('github_oauth_tokens')
      .delete()
      .eq('user_id', userRow.id);

    if (isTableMissingError(error)) {
      return this.fallback.deleteToken(authUserId);
    }
  }
}

export const inMemoryGithubTokenService = new InMemoryGithubTokenService();
export const githubTokenService = inMemoryGithubTokenService;

let cachedClient: SupabaseClient | null = null;
let cachedKey = '';

export function getGithubTokenService(env?: Env['Bindings']): IGithubTokenService {
  const supabaseUrl =
    env?.SUPABASE_URL || (typeof process !== 'undefined' ? process.env?.SUPABASE_URL : undefined);
  const serviceRoleKey =
    env?.SUPABASE_SERVICE_ROLE_KEY ||
    (typeof process !== 'undefined' ? process.env?.SUPABASE_SERVICE_ROLE_KEY : undefined);

  if (supabaseUrl && serviceRoleKey) {
    const keyPair = `${supabaseUrl}::${serviceRoleKey}`;
    if (!cachedClient || cachedKey !== keyPair) {
      cachedClient = createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      cachedKey = keyPair;
    }
    return new SupabaseGithubTokenService(cachedClient, env);
  }

  return inMemoryGithubTokenService;
}
