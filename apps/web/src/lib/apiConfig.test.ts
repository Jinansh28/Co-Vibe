// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { getApiBaseUrl, apiUrl, getWsBaseUrl } from './apiConfig.js';

describe('apiConfig', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('getApiBaseUrl & apiUrl', () => {
    it('defaults to empty string and relative paths when env vars are unset', () => {
      expect(getApiBaseUrl({})).toBe('');
      expect(apiUrl('/api/v1/projects', {})).toBe('/api/v1/projects');
      expect(apiUrl('api/v1/projects', {})).toBe('/api/v1/projects');
    });

    it('uses VITE_API_URL and trims trailing slashes', () => {
      const env = { VITE_API_URL: 'https://co-vibe-api.workers.dev///' };
      expect(getApiBaseUrl(env)).toBe('https://co-vibe-api.workers.dev');
      expect(apiUrl('/api/v1/projects', env)).toBe('https://co-vibe-api.workers.dev/api/v1/projects');
    });

    it('falls back to VITE_API_BASE_URL for backward compatibility and prefers VITE_API_URL', () => {
      expect(getApiBaseUrl({ VITE_API_BASE_URL: 'https://legacy-api.dev/' })).toBe('https://legacy-api.dev');
      expect(
        getApiBaseUrl({
          VITE_API_URL: 'https://primary-api.dev/',
          VITE_API_BASE_URL: 'https://legacy-api.dev/',
        })
      ).toBe('https://primary-api.dev');
    });

    it('preserves absolute URLs passed to apiUrl', () => {
      expect(apiUrl('https://other.example/test', { VITE_API_URL: 'https://api.example' })).toBe(
        'https://other.example/test'
      );
    });

    it('reads import.meta.env via vi.stubEnv', () => {
      vi.stubEnv('VITE_API_URL', 'https://stubbed-api.example/');
      expect(getApiBaseUrl()).toBe('https://stubbed-api.example');
      expect(apiUrl('/api/v1/health')).toBe('https://stubbed-api.example/api/v1/health');
    });
  });

  describe('getWsBaseUrl', () => {
    it('prefers explicit VITE_WS_URL and trims trailing slashes', () => {
      expect(
        getWsBaseUrl({
          VITE_WS_URL: 'wss://ws.co-vibe.dev///',
          VITE_API_URL: 'https://api.co-vibe.dev',
        })
      ).toBe('wss://ws.co-vibe.dev');
    });

    it('derives wss:// or ws:// + host from VITE_API_URL or VITE_API_BASE_URL', () => {
      expect(getWsBaseUrl({ VITE_API_URL: 'https://api.co-vibe.dev/v1' })).toBe('wss://api.co-vibe.dev');
      expect(getWsBaseUrl({ VITE_API_BASE_URL: 'http://127.0.0.1:8787/' })).toBe('ws://127.0.0.1:8787');
    });

    it('derives from window.location in production when WS and API URLs are unset', () => {
      expect(
        getWsBaseUrl(
          { PROD: true },
          { protocol: 'https:', host: 'co-vibe-web.pages.dev', hostname: 'co-vibe-web.pages.dev' }
        )
      ).toBe('wss://co-vibe-web.pages.dev');
    });

    it('defaults to localhost:8787 in local dev when unset', () => {
      expect(
        getWsBaseUrl(
          { PROD: false },
          { protocol: 'http:', host: 'localhost:5173', hostname: 'localhost' }
        )
      ).toBe('ws://localhost:8787');
    });
  });
});
