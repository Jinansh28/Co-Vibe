import React, { useState } from 'react';
import type { HealthStatus } from '@co-vibe/shared';

export default function App() {
  const [apiHealth, setApiHealth] = useState<HealthStatus | null>(null);
  const [runtimeHealth, setRuntimeHealth] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState(false);

  const checkHealth = async () => {
    setLoading(true);
    try {
      const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8787';
      const runtimeBase = import.meta.env.VITE_RUNTIME_BASE_URL || 'http://localhost:7890';

      const [apiRes, runtimeRes] = await Promise.all([
        fetch(`${apiBase}/health`)
          .then((r) => r.json())
          .catch(() => null),
        fetch(`${runtimeBase}/health`)
          .then((r) => r.json())
          .catch(() => null),
      ]);

      setApiHealth(apiRes);
      setRuntimeHealth(runtimeRes);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
      <header
        style={{ borderBottom: '1px solid #334155', paddingBottom: '1rem', marginBottom: '2rem' }}
      >
        <h1 style={{ margin: 0, color: '#38bdf8', fontSize: '1.8rem' }}>Co-Vibe IDE</h1>
        <p style={{ margin: '0.5rem 0 0', color: '#94a3b8' }}>
          Collaborative AI Vibe-Coding Workspace — Foundation Shell
        </p>
      </header>

      <main>
        <section
          style={{
            backgroundColor: '#1e293b',
            borderRadius: '8px',
            padding: '1.5rem',
            marginBottom: '1.5rem',
          }}
        >
          <h2 style={{ marginTop: 0, fontSize: '1.2rem', color: '#e2e8f0' }}>
            System Services Health Check
          </h2>
          <button
            onClick={checkHealth}
            disabled={loading}
            style={{
              backgroundColor: '#0284c7',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              padding: '0.6rem 1.2rem',
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              marginBottom: '1rem',
            }}
          >
            {loading ? 'Checking Services...' : 'Run Health Check'}
          </button>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div
              style={{
                backgroundColor: '#0f172a',
                padding: '1rem',
                borderRadius: '6px',
                border: '1px solid #334155',
              }}
            >
              <h3 style={{ margin: '0 0 0.5rem', fontSize: '1rem', color: '#94a3b8' }}>
                API Worker
              </h3>
              {apiHealth ? (
                <div>
                  <span style={{ color: '#4ade80', fontWeight: 600 }}>
                    ● {apiHealth.status.toUpperCase()}
                  </span>
                  <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '0.25rem' }}>
                    Version: {apiHealth.version} | Service: {apiHealth.service}
                  </div>
                </div>
              ) : (
                <span style={{ color: '#64748b' }}>Not checked / Offline</span>
              )}
            </div>

            <div
              style={{
                backgroundColor: '#0f172a',
                padding: '1rem',
                borderRadius: '6px',
                border: '1px solid #334155',
              }}
            >
              <h3 style={{ margin: '0 0 0.5rem', fontSize: '1rem', color: '#94a3b8' }}>
                Local Runtime Daemon
              </h3>
              {runtimeHealth ? (
                <div>
                  <span style={{ color: '#4ade80', fontWeight: 600 }}>
                    ● {runtimeHealth.status.toUpperCase()}
                  </span>
                  <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '0.25rem' }}>
                    Version: {runtimeHealth.version} | Service: {runtimeHealth.service}
                  </div>
                </div>
              ) : (
                <span style={{ color: '#64748b' }}>Not checked / Offline</span>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
