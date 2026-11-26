const GITHUB_TOKEN_REGEX = /ghp_[a-zA-Z0-9]{36}/g;
const GITHUB_FINE_GRAINED_PAT_REGEX = /github_pat_[a-zA-Z0-9_]{20,}/g;
const GEMINI_API_KEY_REGEX = /AIza[0-9A-Za-z_-]{20,}/g;
const JWT_REGEX = /eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g;
const AUTH_HEADER_REGEX = /((?:['"])?authorization(?:['"])?\s*:\s*(?:['"])?(?:bearer|basic)\s+)[^\s\r\n'"]+/gi;

export function redactSecrets(text: string): string {
    if (!text) {
        return text;
    }

    let redacted = text;

    redacted = redacted.replace(GITHUB_TOKEN_REGEX, '[REDACTED_SECRET]');
    redacted = redacted.replace(GITHUB_FINE_GRAINED_PAT_REGEX, '[REDACTED_SECRET]');
    redacted = redacted.replace(GEMINI_API_KEY_REGEX, '[REDACTED_SECRET]');
    redacted = redacted.replace(JWT_REGEX, '[REDACTED_SECRET]');
    redacted = redacted.replace(AUTH_HEADER_REGEX, '$1[REDACTED_SECRET]');

    return redacted;
}
