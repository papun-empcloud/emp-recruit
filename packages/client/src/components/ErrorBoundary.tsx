import { Component, type ErrorInfo, type ReactNode } from "react";
import { withTranslation, type WithTranslation } from "react-i18next";
import { AlertTriangle, RotateCw } from "lucide-react";

interface Props extends WithTranslation {
  children: ReactNode;
  /** Optional custom fallback. If omitted, a default "something went wrong" card is shown. */
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * App-wide error boundary. Without one, any error thrown while rendering a route
 * (including a failed lazy-chunk import) unmounts the whole React tree, leaving a
 * blank white page with no way to recover. This catches that and shows a friendly
 * fallback with a Reload action instead.
 */
class ErrorBoundaryInner extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Surface for debugging; a real telemetry hook could go here.
    console.error("ErrorBoundary caught an error:", error, info.componentStack);
  }

  handleReload = () => {
    // A failed lazy chunk (e.g. stale after a deploy) is fixed by a hard reload.
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    const { t } = this.props;
    const isChunkError = /loading chunk|dynamically imported module|failed to fetch/i.test(
      this.state.error?.message || "",
    );

    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-gray-900">
            {t("components.errorBoundary.title")}
          </h2>
          <p className="mt-2 text-sm text-gray-500">
            {isChunkError
              ? t("components.errorBoundary.chunkMessage")
              : t("components.errorBoundary.genericMessage")}
          </p>
          <button
            onClick={this.handleReload}
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            <RotateCw className="h-4 w-4" />
            {t("components.errorBoundary.reload")}
          </button>
        </div>
      </div>
    );
  }
}

export const ErrorBoundary = withTranslation()(ErrorBoundaryInner);
