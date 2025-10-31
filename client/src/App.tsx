import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SolanaProvider } from "@/providers/SolanaProvider";
import ClaimSol from "@/pages/claim-sol";
import Referrals from "@/pages/referrals";
import AdminSettings from "@/pages/admin-settings";
import XBotAdmin from "@/pages/x-bot-admin";
import HalloweenThemes from "@/pages/halloween-themes";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={ClaimSol} />
      <Route path="/claim-sol" component={ClaimSol} />
      <Route path="/referrals" component={Referrals} />
      <Route path="/admin/settings" component={AdminSettings} />
      <Route path="/admin/x-bot" component={XBotAdmin} />
      <Route path="/halloween-themes" component={HalloweenThemes} />
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
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </SolanaProvider>
    </QueryClientProvider>
  );
}

export default App;
