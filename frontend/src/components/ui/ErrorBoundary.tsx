import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full p-6 text-center select-none bg-[var(--bg-base)]">
          <AlertTriangle size={32} className="text-[var(--warn)] mb-2" />
          <h2 className="text-sm font-semibold text-[var(--tx-1)]">
            {this.props.fallbackTitle || "Something went wrong in this view"}
          </h2>
          <p className="text-xs text-[var(--tx-2)] font-mono max-w-md my-2 p-2.5 bg-[var(--bg-s3)] border border-[var(--border)] rounded text-left break-all">
            {this.state.error?.message || "An unexpected rendering error occurred"}
          </p>
          <button
            onClick={this.handleReset}
            className="flex items-center gap-1.5 px-3 py-1.5 mt-2 rounded bg-[var(--lime)] text-[var(--tx-inv)] text-xs font-semibold hover:opacity-90"
          >
            <RefreshCw size={12} /> Reload View
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
