// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import App from './App.js';

describe('Web App Shell UI', () => {
  it('renders IDE shell layout grid', () => {
    render(<App />);
    expect(screen.getAllByText(/Co-Vibe/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Explorer/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /Run Project/i })).toBeDefined();
  });
});
