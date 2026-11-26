export const RUNTIME_URL =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_RUNTIME_URL) ||
  'http://127.0.0.1:7890';
