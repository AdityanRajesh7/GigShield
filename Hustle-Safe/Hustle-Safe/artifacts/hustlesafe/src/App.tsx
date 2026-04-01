import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import NotFound from "@/pages/not-found";

import { Landing } from "./pages/Landing";
import { Auth } from "./pages/Auth";
import { WorkerDashboard } from "./pages/worker/Dashboard";
import { WorkerPolicy } from "./pages/worker/Policy";
import { WorkerClaims } from "./pages/worker/Claims";
import { LiveMap } from "./pages/shared/LiveMap";
import { Settings } from "./pages/shared/Settings";

import { InsurerDashboard } from "./pages/insurer/Dashboard";
import { InsurerClaimsQueue } from "./pages/insurer/ClaimsQueue";
import { InsurerAnalytics } from "./pages/insurer/Analytics";
import { InsurerWorkers } from "./pages/insurer/Workers";

import { useAuth } from "./store/auth";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

function ProtectedRoute({ component: Component, roleRequired, ...rest }: any) {
  const { isAuthenticated, role } = useAuth();
  const [location, setLocation] = useLocation();

  if (!isAuthenticated) {
    setLocation("/auth");
    return null;
  }

  if (roleRequired && role !== roleRequired) {
    setLocation(role === 'insurer' ? '/insurer' : '/dashboard');
    return null;
  }

  return <Component {...rest} />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/auth" component={Auth} />
      
      {/* Worker Routes */}
      <Route path="/dashboard"><ProtectedRoute component={WorkerDashboard} roleRequired="worker" /></Route>
      <Route path="/policy"><ProtectedRoute component={WorkerPolicy} roleRequired="worker" /></Route>
      <Route path="/claims"><ProtectedRoute component={WorkerClaims} roleRequired="worker" /></Route>
      
      {/* Shared Route */}
      <Route path="/map"><ProtectedRoute component={LiveMap} /></Route>
      <Route path="/settings"><ProtectedRoute component={Settings} /></Route>

      {/* Insurer Routes */}
      <Route path="/insurer"><ProtectedRoute component={InsurerDashboard} roleRequired="insurer" /></Route>
      <Route path="/insurer/claims"><ProtectedRoute component={InsurerClaimsQueue} roleRequired="insurer" /></Route>
      <Route path="/insurer/analytics"><ProtectedRoute component={InsurerAnalytics} roleRequired="insurer" /></Route>
      <Route path="/insurer/workers"><ProtectedRoute component={InsurerWorkers} roleRequired="insurer" /></Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
        <Router />
      </WouterRouter>
      <Toaster position="bottom-right" richColors />
    </QueryClientProvider>
  );
}

export default App;
