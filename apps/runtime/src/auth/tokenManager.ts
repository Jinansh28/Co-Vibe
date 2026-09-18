import crypto from 'node:crypto';

export interface PairingCodeInfo {
  code: string;
  expiresAt: number;
}

export interface RuntimeTokenInfo {
  token: string;
  runtimeId: string;
  expiresAt: number;
}

export interface JwtPayload {
  sub: string;
  role: string;
  workspaceId?: string;
  iat: number;
  exp: number;
  [key: string]: any;
}

function base64UrlEncode(buffer: Buffer | string): string {
  const buf = typeof buffer === 'string' ? Buffer.from(buffer, 'utf8') : buffer;
  return buf
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64').toString('utf8');
}

export function signHs256Jwt(payload: JwtPayload, secret: string): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signatureInput = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto
    .createHmac('sha256', secret)
    .update(signatureInput)
    .digest();
  const encodedSignature = base64UrlEncode(signature);
  return `${signatureInput}.${encodedSignature}`;
}

export function verifyHs256Jwt(token: string, secret: string): JwtPayload {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWT format');
  }
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const signatureInput = `${encodedHeader}.${encodedPayload}`;
  const expectedSignature = base64UrlEncode(
    crypto.createHmac('sha256', secret).update(signatureInput).digest()
  );

  if (encodedSignature !== expectedSignature) {
    throw new Error('Invalid JWT signature');
  }

  const payload = JSON.parse(base64UrlDecode(encodedPayload)) as JwtPayload;
  const nowInSec = Math.floor(Date.now() / 1000);
  if (payload.exp && nowInSec > payload.exp) {
    throw new Error('JWT token expired');
  }

  return payload;
}

export class TokenManager {
  private runtimeId: string;
  private secret: string;
  private pairingCode: string | null = null;
  private pairingExpiresAt: number = 0;
  private activeToken: string | null = null;

  constructor(secret?: string, runtimeId?: string) {
    this.secret =
      secret ||
      process.env.RUNTIME_JWT_SECRET ||
      process.env.SUPABASE_JWT_SECRET ||
      'dev-secret-key-change-in-prod';
    this.runtimeId = runtimeId || `runtime-${crypto.randomBytes(6).toString('hex')}`;
  }

  public getRuntimeId(): string {
    return this.runtimeId;
  }

  public getActiveToken(): string | null {
    return this.activeToken;
  }

  public generatePairingCode(ttlMs: number = 5 * 60 * 1000): PairingCodeInfo {
    const code = crypto.randomInt(100000, 1000000).toString();
    const expiresAt = Date.now() + ttlMs;
    this.pairingCode = code;
    this.pairingExpiresAt = expiresAt;
    return { code, expiresAt };
  }

  public getPairingCode(): PairingCodeInfo {
    if (this.pairingCode && Date.now() < this.pairingExpiresAt) {
      return { code: this.pairingCode, expiresAt: this.pairingExpiresAt };
    }
    return this.generatePairingCode();
  }

  public verifyPairingCode(code: string): boolean {
    if (!this.pairingCode || Date.now() > this.pairingExpiresAt) {
      return false;
    }
    if (code.trim() !== this.pairingCode) {
      return false;
    }
    this.pairingCode = null;
    this.pairingExpiresAt = 0;
    return true;
  }

  public generateRuntimeToken(
    workspaceId?: string,
    ttlSeconds: number = 24 * 60 * 60
  ): RuntimeTokenInfo {
    const nowSec = Math.floor(Date.now() / 1000);
    const expiresAtSec = nowSec + ttlSeconds;

    const payload: JwtPayload = {
      sub: this.runtimeId,
      role: 'runtime',
      workspaceId,
      iat: nowSec,
      exp: expiresAtSec,
    };

    const token = signHs256Jwt(payload, this.secret);
    this.activeToken = token;

    return {
      token,
      runtimeId: this.runtimeId,
      expiresAt: expiresAtSec * 1000,
    };
  }

  public verifyRuntimeToken(token: string): JwtPayload {
    return verifyHs256Jwt(token, this.secret);
  }
}
