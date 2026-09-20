import React from 'react';

export interface HunkSelectorProps {
  hunks: string[];
  selectedHunks: string[];
  onChange: (hunks: string[]) => void;
}

export const HunkSelector: React.FC<HunkSelectorProps> = ({ hunks, selectedHunks, onChange }) => {
  const handleToggle = (hunk: string) => {
    if (selectedHunks.includes(hunk)) {
      onChange(selectedHunks.filter(h => h !== hunk));
    } else {
      onChange([...selectedHunks, hunk]);
    }
  };

  return (
    <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', margin: '0' }}>
        Changed Hunks
      </h3>
      {hunks.length === 0 ? (
        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>No hunks found.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {hunks.map(hunk => (
            <label
              key={hunk}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '12px',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                userSelect: 'none'
              }}
            >
              <input
                type="checkbox"
                checked={selectedHunks.includes(hunk)}
                onChange={() => handleToggle(hunk)}
                style={{ cursor: 'pointer', margin: 0 }}
              />
              {hunk}
            </label>
          ))}
        </div>
      )}
    </div>
  );
};
