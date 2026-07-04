import React from "react";

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    // If Crashlytics is configured, log the error
    import("../firebase/firebaseConfig").then(({ crashlytics }) => {
      if (crashlytics) {
        crashlytics.recordError(error);
      }
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#f9f9ff] flex flex-col justify-center items-center p-6 text-center">
          <div className="bg-white border border-[#dce2f3] rounded-xl p-8 max-w-lg shadow-[0_10px_24px_rgba(0,0,0,0.05)] space-y-6">
            <div className="w-16 h-16 bg-[#ffdbd0] rounded-full flex items-center justify-center mx-auto text-[#10b981]">
              <span className="material-symbols-outlined text-4xl" style={{ fontVariationSettings: "'FILL' 1" }}>error</span>
            </div>
            
            <div className="space-y-2">
              <h2 className="font-headline-lg text-headline-lg text-[#151c27] font-semibold">Something went wrong</h2>
              <p className="font-body-md text-body-md text-[#555f6f]">
                An unexpected system error occurred. Our team has been notified.
              </p>
            </div>

            {this.state.error && (
              <div className="text-left bg-[#f0f3ff] border border-[#dce2f3] rounded p-4 text-xs font-mono text-[#475569] overflow-auto max-h-40">
                <p className="font-bold">{this.state.error.toString()}</p>
                <p className="mt-2 whitespace-pre">{this.state.errorInfo?.componentStack}</p>
              </div>
            )}

            <div className="flex gap-4 justify-center">
              <button
                onClick={() => window.location.reload()}
                className="px-5 py-2.5 bg-[#10b981] hover:bg-[#059669] text-white font-label-md text-label-md rounded-lg shadow transition-all inner-shine"
              >
                Reload Dashboard
              </button>
              <button
                onClick={() => {
                  window.location.href = "/";
                }}
                className="px-5 py-2.5 border border-[#dce2f3] text-[#151c27] bg-white hover:bg-[#f0f3ff] font-label-md text-label-md rounded-lg transition-all"
              >
                Go to Home
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
export default ErrorBoundary;
