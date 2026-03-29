import React from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary] Uncaught error:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen px-6 bg-background text-foreground">
          <div className="glass-panel rounded-2xl p-8 max-w-md text-center space-y-4">
            <AlertCircle className="h-10 w-10 text-destructive mx-auto" />
            <h1 className="text-xl font-bold">Something went wrong</h1>
            <p className="text-sm text-muted-foreground">
              An unexpected error occurred. Please reload the page to try again.
            </p>
            {this.state.error && (
              <p className="text-xs text-muted-foreground/60 font-mono bg-surface-0/60 rounded-lg p-3 break-all">
                {this.state.error.message}
              </p>
            )}
            <Button
              onClick={() => window.location.reload()}
              className="gap-2 rounded-xl"
            >
              <RefreshCw className="h-4 w-4" />
              Reload
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
