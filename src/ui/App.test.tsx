import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { App } from './App';

describe('App shell', () => {
  it('states that prototype implementation has not started', () => {
    render(<App />);

    expect(
      screen.getByRole('heading', { name: 'StateSketch' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Prototype implementation has not started yet.'),
    ).toBeInTheDocument();
  });
});
