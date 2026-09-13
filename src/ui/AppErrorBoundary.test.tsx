import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as learning from '../application/learning-session/session';
import { AppErrorBoundary } from './AppErrorBoundary';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function BrokenChild(): never {
  throw new Error('unexpected render failure');
}

describe('application fatal error boundary', () => {
  it('replaces a failed child with a focused fallback and reload-only recovery', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const focus = vi.spyOn(HTMLElement.prototype, 'focus');
    const reloadPage = vi.fn();
    const reduce = vi.spyOn(learning, 'reduceLearningSession');

    render(
      <AppErrorBoundary reloadPage={reloadPage}>
        <BrokenChild />
      </AppErrorBoundary>,
    );

    const heading = screen.getByRole('heading', {
      level: 1,
      name: 'Something went wrong.',
    });
    expect(heading).toBeVisible();
    expect(heading).toHaveFocus();
    expect(focus).toHaveBeenCalledTimes(1);
    expect(
      screen.getByText('Reload StateSketch to start a fresh session.'),
    ).toBeVisible();
    const reload = screen.getByRole('button', { name: 'Reload StateSketch' });
    expect(reload.tagName).toBe('BUTTON');
    expect(document.querySelectorAll('[aria-live]')).toHaveLength(0);

    fireEvent.click(reload);
    expect(reloadPage).toHaveBeenCalledTimes(1);
    expect(reduce).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('button', { name: /retry|continue|restore/i }),
    ).not.toBeInTheDocument();
  });
});
