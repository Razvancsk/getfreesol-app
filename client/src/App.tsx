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
import XAdmin from "@/pages/x-admin";
import ApiDocs from "@/pages/api-docs";
import DeveloperDashboard from "@/pages/developer-dashboard";
import AdminMigrate from "@/pages/admin-migrate";
import ProfilePage from "@/pages/profile";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={ClaimSol} />
      <Route path="/claim-sol" component={ClaimSol} />
      <Route path="/referrals" component={Referrals} />
      <Route path="/developer" component={DeveloperDashboard} />
      <Route path="/admin/settings" component={AdminSettings} />
      <Route path="/admin/x-bot" component={XBotAdmin} />
      <Route path="/x-admin" component={XAdmin} />
      <Route path="/admin/migrate" component={AdminMigrate} />
      <Route path="/docs" component={ApiDocs} />
      <Route path="/profile" component={ProfilePage} />
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
