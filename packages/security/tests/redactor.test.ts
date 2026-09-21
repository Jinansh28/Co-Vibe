import { describe, it, expect } from 'vitest';
import { redactSecrets } from '../src/redactor.js';

describe('redactSecrets', () => {
    it('should redact GitHub classic tokens', () => {
        const input = 'Here is my token ghp_1234567890abcdefghijklmnopqrstuvwxyz and more text.';
        const expected = 'Here is my token [REDACTED_SECRET] and more text.';
        expect(redactSecrets(input)).toBe(expected);
    });

    it('should redact JWT tokens', () => {
        const input = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c in a log.';
        const expected = 'Bearer [REDACTED_SECRET] in a log.';
        expect(redactSecrets(input)).toBe(expected);
    });

    it('should redact Authorization Bearer headers', () => {
        const input = 'Headers: { "authorization": "Bearer some-secret-token" }';
        const expected = 'Headers: { "authorization": "Bearer [REDACTED_SECRET]" }';
        expect(redactSecrets(input)).toBe(expected);
    });

    it('should redact Authorization Basic headers', () => {
        const input = 'Headers: { "Authorization": "Basic YWRtaW46cGFzc3dvcmQ=" }';
        const expected = 'Headers: { "Authorization": "Basic [REDACTED_SECRET]" }';
        expect(redactSecrets(input)).toBe(expected);
    });

    it('should handle multiple secrets in the same string', () => {
        const input = 'Token ghp_1234567890abcdefghijklmnopqrstuvwxyz and Authorization: Bearer abcdef12345';
        const expected = 'Token [REDACTED_SECRET] and Authorization: Bearer [REDACTED_SECRET]';
        expect(redactSecrets(input)).toBe(expected);
    });

    it('should return original text if no secrets are found', () => {
        const input = 'Just a normal log line without any secrets.';
        expect(redactSecrets(input)).toBe(input);
    });

    it('should handle empty or null strings', () => {
        expect(redactSecrets('')).toBe('');
        expect(redactSecrets(null as any)).toBe(null);
        expect(redactSecrets(undefined as any)).toBe(undefined);
    });
});
