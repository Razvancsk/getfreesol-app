import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";

// Lazy load components to prevent loading issues
import ClaimSol from "@/pages/claim-sol";
import SwapPage from "@/pages/swap";
import NotFound from "@/pages/not-found";

function ErrorFallback({ error }: { error: Error }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
      <div className="text-white text-center max-w-md p-6">
        <h1 className="text-2xl font-bold mb-4">Something went wrong</h1>
        <p className="text-red-300 mb-4">{error.message}</p>
        <button 
          onClick={() => window.location.reload()} 
          className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded"
        >
          Reload Page
        </button>
      </div>
    </div>
  );
}

function LoadingFallback() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
      <div className="text-white text-center">
        <h1 className="text-4xl font-bold mb-4">Get Your Sol</h1>
        <p className="text-xl">Loading application...</p>
      </div>
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={ClaimSol} />
      <Route path="/claim-sol" component={ClaimSol} />
      <Route path="/swap" component={SwapPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Suspense fallback={<LoadingFallback />}>
            <Toaster />
            <Router />
          </Suspense>
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
