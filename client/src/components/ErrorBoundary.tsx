import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "./ui/button";

interface Props {
  children: ReactNode;
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
    // In a real deployment, forward this to an error-tracking service
    // (Sentry, etc.) — at minimum, this ensures production errors are
    // never silently invisible the way they were before.
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-8 text-center">
        <h2 className="text-2xl font-display font-semibold">Something went wrong</h2>
        <p className="max-w-md text-muted-foreground">
          We hit an unexpected error loading this page. Please try again — if it keeps happening, call the clinic
          directly and we'll help you book over the phone.
        </p>
        {import.meta.env.DEV && (
          <pre className="mt-2 max-w-xl overflow-auto rounded-md bg-muted p-4 text-left text-xs text-muted-foreground">
            {this.state.error.stack}
          </pre>
        )}
        <Button onClick={() => this.setState({ error: null })}>Try again</Button>
      </div>
    );
  }
}
