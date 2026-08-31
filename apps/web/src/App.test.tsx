// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import App from './App.js';

describe('Web App Shell UI', () => {
  it('renders header title and Health Check section', () => {
    render(<App />);
    expect(screen.getByText(/Co-Vibe IDE/i)).toBeDefined();
    expect(screen.getByText(/System Services Health Check/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /Run Health Check/i })).toBeDefined();
  });
});
