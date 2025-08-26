import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SolanaProvider } from "@/providers/SolanaProvider";
import ClaimSol from "@/pages/claim-sol";
import SwapPage from "@/pages/swap";
import Referrals from "@/pages/referrals";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={ClaimSol} />
      <Route path="/claim-sol" component={ClaimSol} />
      <Route path="/swap" component={SwapPage} />
      <Route path="/referrals" component={Referrals} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SolanaProvider>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </SolanaProvider>
    </QueryClientProvider>
  );
}

export default App;
