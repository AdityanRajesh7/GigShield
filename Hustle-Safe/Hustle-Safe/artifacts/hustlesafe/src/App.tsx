import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import NotFound from "@/pages/not-found";

import { Landing } from "./pages/Landing";
import { Auth } from "./pages/Auth";
import { WorkerDashboard } from "./pages/worker/Dashboard";
import { WorkerPolicy } from "./pages/worker/Policy";
import { WorkerClaims } from "./pages/worker/Claims";
import { WorkerWallet } from "./pages/worker/Wallet";
import { LiveMap } from "./pages/shared/LiveMap";
import { Settings } from "./pages/shared/Settings";

import { InsurerDashboard } from "./pages/insurer/Dashboard";
import { InsurerClaimsQueue } from "./pages/insurer/ClaimsQueue";
import { InsurerAnalytics } from "./pages/insurer/Analytics";
import { InsurerWorkers } from "./pages/insurer/Workers";
import { InsurerFraudEngine } from "./pages/insurer/FraudEngineView";

import { useAuth } from "./store/auth";
import { auth as firebaseAuth } from "./lib/firebase";
import { firebaseSignOut } from "./lib/firebase";

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

function FirebaseAuthListener() {
  const { setFirebaseUser, logout, isAuthenticated } = useAuth();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(firebaseAuth, (user: import("firebase/auth").User | null) => {
      if (user) {
        setFirebaseUser({
          uid: user.uid,
          email: user.email,
          phoneNumber: user.phoneNumber,
          displayName: user.displayName,
        });
      } else if (isAuthenticated) {
        // Firebase session ended — log user out of Zustand store too
        logout();
      }
    });

    return () => unsubscribe();
  }, [setFirebaseUser, logout, isAuthenticated]);

  return null;
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
      <Route path="/wallet"><ProtectedRoute component={WorkerWallet} roleRequired="worker" /></Route>
      
      {/* Shared Route */}
      <Route path="/map"><ProtectedRoute component={LiveMap} /></Route>
      <Route path="/settings"><ProtectedRoute component={Settings} /></Route>

      {/* Insurer Routes */}
      <Route path="/insurer"><ProtectedRoute component={InsurerDashboard} roleRequired="insurer" /></Route>
      <Route path="/insurer/claims"><ProtectedRoute component={InsurerClaimsQueue} roleRequired="insurer" /></Route>
      <Route path="/insurer/analytics"><ProtectedRoute component={InsurerAnalytics} roleRequired="insurer" /></Route>
      <Route path="/insurer/workers"><ProtectedRoute component={InsurerWorkers} roleRequired="insurer" /></Route>
      <Route path="/insurer/fraud"><ProtectedRoute component={InsurerFraudEngine} roleRequired="insurer" /></Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
        <FirebaseAuthListener />
        <Router />
      </WouterRouter>
      <Toaster position="bottom-right" richColors />
    </QueryClientProvider>
  );
}

export default App;
