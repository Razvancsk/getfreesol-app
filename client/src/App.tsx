import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SolanaProvider } from "@/providers/SolanaProvider";
import { JupiterTerminalProvider } from "@/components/JupiterTerminalProvider";
import ClaimSol from "@/pages/claim-sol";
import Referrals from "@/pages/referrals";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={ClaimSol} />
      <Route path="/claim-sol" component={ClaimSol} />
      <Route path="/referrals" component={Referrals} />
      {/* Catch-all route for referral codes - any single path segment should render ClaimSol */}
      <Route path="/:referralCode" component={ClaimSol} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SolanaProvider>
        <JupiterTerminalProvider>
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
        </JupiterTerminalProvider>
      </SolanaProvider>
    </QueryClientProvider>
  );
}

export default App;
