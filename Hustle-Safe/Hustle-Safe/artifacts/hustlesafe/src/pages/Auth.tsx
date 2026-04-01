import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/store/auth";
import { useGetWorkerByPhone } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Shield } from "lucide-react";
import { motion } from "framer-motion";

export function Auth() {
  const [, setLocation] = useLocation();
  const { loginWorker, loginInsurer } = useAuth();

  const [role, setRole] = useState<"worker" | "insurer">("worker");
  const [phone, setPhone] = useState("+91 9876543210");
  const [otp, setOtp] = useState("123456");
  const [email, setEmail] = useState("insurer@hustlesafe.in");
  const [password, setPassword] = useState("demo2026");
  const [isLoading, setIsLoading] = useState(false);

  // We manually trigger the hook by passing `enabled: false` and fetching manually if needed,
  // but since standard React Query hooks are generated, we can just use the query client or standard fetch.
  // The easiest is to let the hook fetch if phone is valid, then manually access data.
  const { data: workerData } = useGetWorkerByPhone(phone, {
    query: { enabled: role === "worker" && phone.length > 10 },
  });

  const handleWorkerLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setTimeout(() => {
      if (otp === "123456") {
        if (workerData) {
          loginWorker(workerData);
        } else {
          // Fallback mock worker if API is unseeded
          loginWorker({
            id: "w-demo",
            name: "Ravi Kumar",
            phone: "+91 9876543210",
            platform: "zomato",
            zone_id: "koramangala",
            platform_rating: 4.8,
            policy_tier: "standard",
            is_active: true,
            fraud_score: 0.12,
            account_age_days: 340,
            created_at: new Date().toISOString(),
          });
        }
        setLocation("/dashboard");
      }
      setIsLoading(false);
    }, 800);
  };

  const handleInsurerLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setTimeout(() => {
      if (email === "insurer@hustlesafe.in" && password === "demo2026") {
        loginInsurer();
        setLocation("/insurer");
      }
      setIsLoading(false);
    }, 800);
  };

  return (
    <div className="min-h-screen flex bg-background">
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <div className="flex justify-center mb-10">
            <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center text-primary-foreground shadow-lg shadow-primary/20">
              <Shield className="w-6 h-6" />
            </div>
          </div>

          <div className="bg-card border border-border shadow-xl shadow-black/5 rounded-3xl p-8">
            <div className="flex p-1 bg-muted rounded-xl mb-8">
              <button
                onClick={() => setRole("worker")}
                className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all ${role === "worker" ? "bg-card text-foreground shadow" : "text-muted-foreground"}`}
              >
                Delivery Partner
              </button>
              <button
                onClick={() => setRole("insurer")}
                className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all ${role === "insurer" ? "bg-card text-foreground shadow" : "text-muted-foreground"}`}
              >
                Insurer Login
              </button>
            </div>

            {role === "worker" ? (
              <motion.form
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                onSubmit={handleWorkerLogin}
                className="space-y-5"
              >
                <div>
                  <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
                    Phone Number
                  </label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-medium"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
                    OTP
                  </label>
                  <input
                    type="text"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-medium"
                    placeholder="Enter 6-digit OTP"
                  />
                  <p className="text-xs text-muted-foreground mt-2">
                    Demo: Use OTP 123456
                  </p>
                </div>
                <Button
                  type="submit"
                  className="w-full h-12 text-base font-bold rounded-xl mt-4"
                  disabled={isLoading}
                >
                  {isLoading ? "Verifying..." : "Secure Login"}
                </Button>
              </motion.form>
            ) : (
              <motion.form
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                onSubmit={handleInsurerLogin}
                className="space-y-5"
              >
                <div>
                  <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-medium"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
                    Password
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-medium"
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full h-12 text-base font-bold rounded-xl mt-4 bg-foreground text-background hover:bg-foreground/90"
                  disabled={isLoading}
                >
                  {isLoading ? "Authenticating..." : "Enter Command Center"}
                </Button>
              </motion.form>
            )}
          </div>
        </div>
      </div>
      <div className="hidden lg:block lg:flex-1 bg-muted relative overflow-hidden">
        <video
          className="w-full h-full object-cover"
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          poster="/images/hero-bg.png"
        >
          <source src="/media/HustleSafe_bg.mp4" type="video/mp4" />
          Your browser does not support HTML5 video.
        </video>
        <div className="absolute inset-0 bg-black/50" />
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent" />
      </div>
    </div>
  );
}
