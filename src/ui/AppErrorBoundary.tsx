import { Component, createRef, type ReactNode } from 'react';
import styles from './App.module.css';

interface AppErrorBoundaryProps {
  readonly children: ReactNode;
  readonly reloadPage?: () => void;
}

interface AppErrorBoundaryState {
  readonly hasError: boolean;
}

function reloadBrowser() {
  window.location.reload();
}

export class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { hasError: false };
  private readonly heading = createRef<HTMLHeadingElement>();
  private fallbackFocused = false;

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch() {
    // This last-resort boundary intentionally has no telemetry or state repair.
    this.focusFallback();
  }

  componentDidUpdate() {
    this.focusFallback();
  }

  private focusFallback() {
    if (this.state.hasError && !this.fallbackFocused) {
      this.fallbackFocused = true;
      this.heading.current?.focus();
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className={styles.fatalError}>
          <h1 ref={this.heading} tabIndex={-1}>
            Something went wrong.
          </h1>
          <p>Reload StateSketch to start a fresh session.</p>
          <button
            type="button"
            onClick={this.props.reloadPage ?? reloadBrowser}
          >
            Reload StateSketch
          </button>
        </main>
      );
    }

    return this.props.children;
  }
}
