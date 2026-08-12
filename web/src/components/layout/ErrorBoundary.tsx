import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

/**
 * Containment for a screen that throws.
 *
 * React unmounts the *entire* tree when an error escapes render or a cleanup
 * function, and this app had no boundary anywhere — so one throw from a single
 * screen left `#root` empty for the rest of the session. Every subsequent tap and
 * the back button did nothing, because there was no longer an app to receive
 * them. That is a total outage caused by a fault in one component.
 *
 * A boundary turns that into a recoverable message on the affected screen. Keyed
 * on the route by its parent, so simply navigating elsewhere clears it.
 */
interface Props {
  children: ReactNode;
  /** Shown to the user; the technical detail stays in the console. */
  label?: string;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Kept deliberately: without it a contained error is invisible to whoever
    // has to fix it. Replace with the app's reporter when there is one.
    console.error('[Routify] screen error', error, info.componentStack);
  }

  private reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-0 flex-1 items-center justify-center bg-canvas px-6">
        <div className="max-w-[320px] text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-[14px] bg-warn-bg text-warn">
            <AlertTriangle size={22} strokeWidth={2.1} />
          </span>
          <h2 className="mt-3 font-display text-[17px] font-bold text-ink">
            {this.props.label ?? 'This screen ran into a problem'}
          </h2>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-3">
            The rest of the app is unaffected — you can go back, or try this screen again.
          </p>
          <button
            onClick={this.reset}
            className="mt-4 inline-flex h-10 items-center justify-center gap-1.5 rounded-field bg-brand-600 px-4 text-[13.5px] font-semibold text-white transition-colors hover:bg-brand-700"
          >
            <RotateCcw size={15} strokeWidth={2.4} />
            Try again
          </button>
        </div>
      </div>
    );
  }
}
