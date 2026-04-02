import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/store/auth";
import { useGetWorkerByPhone } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  auth,
  setupRecaptcha,
  sendOtp,
  verifyOtp,
  emailSignIn,
  emailSignUp,
} from "@/lib/firebase";
import type { ConfirmationResult } from "firebase/auth";
import {
  Phone,
  Mail,
  Lock,
  User,
  ArrowRight,
  Shield,
  Loader2,
  Eye,
  EyeOff,
  CheckCircle2,
} from "lucide-react";

// ── Animation Variants ──────────────────────────────────────────────────
const fadeSlide = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -12 },
  transition: { duration: 0.3, ease: "easeOut" as const },
};

const stagger = {
  animate: { transition: { staggerChildren: 0.06 } },
};

const itemVariant = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.25 } },
};

// ── OTP Input Component ─────────────────────────────────────────────────
function OtpInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (val: string) => void;
}) {
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  const handleChange = (idx: number, char: string) => {
    if (!/^\d?$/.test(char)) return;
    const arr = value.split("");
    arr[idx] = char;
    const next = arr.join("").slice(0, 6);
    onChange(next);
    if (char && idx < 5) inputs.current[idx + 1]?.focus();
  };

  const handleKeyDown = (idx: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !value[idx] && idx > 0) {
      inputs.current[idx - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, 6);
    onChange(pasted);
    const focusIdx = Math.min(pasted.length, 5);
    inputs.current[focusIdx]?.focus();
  };

  return (
    <div className="flex gap-2.5 justify-center">
      {Array.from({ length: 6 }).map((_, i) => (
        <input
          key={i}
          ref={(el) => {
            inputs.current[i] = el;
          }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={value[i] || ""}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          className="w-12 h-14 text-center text-xl font-bold rounded-xl border-2 border-border bg-background
                     focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all duration-200
                     text-foreground placeholder:text-muted-foreground/30"
          placeholder="·"
        />
      ))}
    </div>
  );
}

// ── Main Auth Component ─────────────────────────────────────────────────
export function Auth() {
  const [, setLocation] = useLocation();
  const { loginWorker, loginInsurer } = useAuth();

  // Tab & mode state
  const [role, setRole] = useState<"worker" | "insurer">("worker");
  const [mode, setMode] = useState<"login" | "signup">("login");

  // Worker fields
  const [phone, setPhone] = useState("");
  const [workerName, setWorkerName] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [confirmationResult, setConfirmationResult] =
    useState<ConfirmationResult | null>(null);

  // Insurer fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [insurerName, setInsurerName] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // General state
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const recaptchaContainerRef = useRef<HTMLDivElement>(null);

  // Worker lookup from API
  const cleanPhone = phone.replace(/\s/g, "");
  const { data: workerData } = useGetWorkerByPhone(cleanPhone, {
    query: { enabled: role === "worker" && cleanPhone.length >= 10 } as any,
  });

  // Clear errors on tab/mode change
  useEffect(() => {
    setError("");
    setOtp("");
    setOtpSent(false);
    setConfirmationResult(null);
  }, [role, mode]);

  // ── Format phone for display ──────────────────────────────────────
  const formatPhone = (val: string) => {
    const digits = val.replace(/\D/g, "");
    if (digits.length <= 2) return `+${digits}`;
    if (digits.length <= 7) return `+${digits.slice(0, 2)} ${digits.slice(2)}`;
    return `+${digits.slice(0, 2)} ${digits.slice(2, 7)} ${digits.slice(7, 12)}`;
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^\d+]/g, "");
    setPhone(raw.startsWith("+") ? raw : `+${raw}`);
  };

  // ── Build Firebase user info helper ───────────────────────────────
  const buildFirebaseUser = useCallback(
    (user: {
      uid: string;
      email: string | null;
      phoneNumber: string | null;
      displayName: string | null;
    }) => ({
      uid: user.uid,
      email: user.email,
      phoneNumber: user.phoneNumber,
      displayName: user.displayName,
    }),
    [],
  );

  // ── Send OTP ──────────────────────────────────────────────────────
  const handleSendOtp = async () => {
    if (cleanPhone.length < 10) {
      setError("Please enter a valid phone number with country code");
      return;
    }
    if (mode === "signup" && !workerName.trim()) {
      setError("Please enter your full name");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const recaptcha = setupRecaptcha("recaptcha-container");
      const result = await sendOtp(cleanPhone, recaptcha);
      setConfirmationResult(result);
      setOtpSent(true);
      toast.success("OTP sent successfully!", {
        description: `A 6-digit code has been sent to ${formatPhone(phone)}`,
      });
    } catch (err: any) {
      const msg =
        err?.code === "auth/invalid-phone-number"
          ? "Invalid phone number format. Use +91XXXXXXXXXX"
          : err?.code === "auth/too-many-requests"
            ? "Too many attempts. Please try again later."
            : err?.message || "Failed to send OTP. Please try again.";
      setError(msg);
      toast.error("Failed to send OTP", { description: msg });
    } finally {
      setIsLoading(false);
    }
  };

  // ── Verify OTP (Worker Login / Signup) ────────────────────────────
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmationResult) return;
    if (otp.length !== 6) {
      setError("Please enter the complete 6-digit OTP");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const credential = await verifyOtp(confirmationResult, otp);
      const fbUser = buildFirebaseUser(credential.user);

      if (workerData) {
        loginWorker(workerData, fbUser);
      } else {
        loginWorker(
          {
            id: credential.user.uid,
            name:
              workerName || credential.user.displayName || "Delivery Partner",
            phone: credential.user.phoneNumber || cleanPhone,
            platform: "zomato",
            zone_id: "koramangala",
            platform_rating: 0,
            policy_tier: "basic",
            is_active: true,
            fraud_score: 0,
            account_age_days: 0,
            created_at: new Date().toISOString(),
          },
          fbUser,
        );
      }

      toast.success(mode === "signup" ? "Account created!" : "Welcome back!", {
        description: "Redirecting to your dashboard...",
      });
      setLocation("/dashboard");
    } catch (err: any) {
      const msg =
        err?.code === "auth/invalid-verification-code"
          ? "Invalid OTP. Please check and try again."
          : err?.code === "auth/code-expired"
            ? "OTP has expired. Please request a new one."
            : err?.message || "Verification failed. Please try again.";
      setError(msg);
      toast.error("Verification failed", { description: msg });
    } finally {
      setIsLoading(false);
    }
  };

  // ── Insurer Login ─────────────────────────────────────────────────
  const handleInsurerLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError("Please fill in all fields");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const credential = await emailSignIn(email, password);
      loginInsurer(buildFirebaseUser(credential.user));
      toast.success("Welcome back!", {
        description: "Redirecting to command center...",
      });
      setLocation("/insurer");
    } catch (err: any) {
      const msg =
        err?.code === "auth/user-not-found" ||
        err?.code === "auth/wrong-password" ||
        err?.code === "auth/invalid-credential"
          ? "Invalid email or password"
          : err?.code === "auth/too-many-requests"
            ? "Too many failed attempts. Please try again later."
            : err?.message || "Login failed. Please try again.";
      setError(msg);
      toast.error("Login failed", { description: msg });
    } finally {
      setIsLoading(false);
    }
  };

  // ── Insurer Signup ────────────────────────────────────────────────
  const handleInsurerSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!insurerName.trim() || !email.trim() || !password || !confirmPassword) {
      setError("Please fill in all fields");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const credential = await emailSignUp(email, password, insurerName);
      loginInsurer(buildFirebaseUser(credential.user));
      toast.success("Account created!", {
        description: "Welcome to the command center",
      });
      setLocation("/insurer");
    } catch (err: any) {
      const msg =
        err?.code === "auth/email-already-in-use"
          ? "An account with this email already exists"
          : err?.code === "auth/weak-password"
            ? "Password is too weak. Use at least 6 characters."
            : err?.message || "Sign up failed. Please try again.";
      setError(msg);
      toast.error("Sign up failed", { description: msg });
    } finally {
      setIsLoading(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex bg-background">
      {/* ─── Left: Auth Form ─────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center p-6 md:p-8">
        <div className="w-full max-w-md">
          {/* Logo */}
          <motion.div
            className="flex justify-center mb-8"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
          >
            <div className="w-20 h-20 rounded-3xl bg-primary/10 flex items-center justify-center shadow-xl shadow-primary/5 border border-primary/20">
              <img
                src="/images/logo.png"
                alt="HustleSafe"
                className="w-18 h-18 object-contain scale-110"
              />
            </div>
          </motion.div>

          {/* Card */}
          <motion.div
            className="bg-card border border-border shadow-2xl shadow-black/8 rounded-3xl p-7 md:p-8"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            {/* Role Tabs */}
            <div className="flex p-1 bg-muted rounded-2xl mb-6">
              {(["worker", "insurer"] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setRole(r)}
                  className={`flex-1 py-3 text-sm font-bold rounded-xl transition-all duration-300 flex items-center justify-center gap-2 ${
                    role === r
                      ? "bg-card text-foreground shadow-md"
                      : "text-muted-foreground hover:text-foreground/70"
                  }`}
                >
                  {r === "worker" ? (
                    <Phone className="w-4 h-4" />
                  ) : (
                    <Shield className="w-4 h-4" />
                  )}
                  {r === "worker" ? "Delivery Partner" : "Insurer"}
                </button>
              ))}
            </div>

            {/* Login / Signup Toggle */}
            <div className="flex items-center justify-center gap-1 mb-6">
              <span className="text-sm text-muted-foreground">
                {mode === "login" ? "New here?" : "Already have an account?"}
              </span>
              <button
                onClick={() => setMode(mode === "login" ? "signup" : "login")}
                className="text-sm font-bold text-primary hover:text-primary/80 transition-colors underline underline-offset-2"
              >
                {mode === "login" ? "Create Account" : "Sign In"}
              </button>
            </div>

            {/* Error Banner */}
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mb-4 p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm font-medium"
                >
                  {error}
                </motion.div>
              )}
            </AnimatePresence>

            {/* ─── Worker Auth ──────────────────────────────── */}
            <AnimatePresence mode="wait">
              {role === "worker" ? (
                <motion.div key="worker" {...fadeSlide}>
                  {!otpSent ? (
                    /* ── Step 1: Phone Input ── */
                    <motion.div
                      key="phone-step"
                      variants={stagger}
                      initial="initial"
                      animate="animate"
                      className="space-y-4"
                    >
                      <motion.h2
                        variants={itemVariant}
                        className="text-xl font-bold text-center mb-1"
                      >
                        {mode === "login" ? "Welcome Back" : "Join HustleSafe"}
                      </motion.h2>
                      <motion.p
                        variants={itemVariant}
                        className="text-sm text-muted-foreground text-center mb-4"
                      >
                        {mode === "login"
                          ? "Sign in with your registered phone number"
                          : "Create your delivery partner account"}
                      </motion.p>

                      {mode === "signup" && (
                        <motion.div variants={itemVariant}>
                          <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
                            Full Name
                          </label>
                          <div className="relative">
                            <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <input
                              type="text"
                              value={workerName}
                              onChange={(e) => setWorkerName(e.target.value)}
                              className="w-full pl-10 pr-4 py-3.5 rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-medium"
                              placeholder="Ravi Kumar"
                            />
                          </div>
                        </motion.div>
                      )}

                      <motion.div variants={itemVariant}>
                        <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
                          Phone Number
                        </label>
                        <div className="relative">
                          <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <input
                            type="tel"
                            value={formatPhone(phone)}
                            onChange={handlePhoneChange}
                            className="w-full pl-10 pr-4 py-3.5 rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-medium"
                            placeholder="+91 98765 43210"
                          />
                        </div>
                      </motion.div>

                      <motion.div variants={itemVariant}>
                        <Button
                          type="button"
                          onClick={handleSendOtp}
                          className="w-full h-12 text-base font-bold rounded-xl mt-2 bg-gradient-to-r from-primary to-primary/90 hover:from-primary/95 hover:to-primary/85 shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transition-all duration-300"
                          disabled={isLoading}
                        >
                          {isLoading ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              Sending OTP...
                            </>
                          ) : (
                            <>
                              Send OTP
                              <ArrowRight className="w-4 h-4 ml-2" />
                            </>
                          )}
                        </Button>
                      </motion.div>
                    </motion.div>
                  ) : (
                    /* ── Step 2: OTP Verification ── */
                    <motion.form
                      key="otp-step"
                      onSubmit={handleVerifyOtp}
                      variants={stagger}
                      initial="initial"
                      animate="animate"
                      className="space-y-5"
                    >
                      <motion.div
                        variants={itemVariant}
                        className="text-center"
                      >
                        <div className="w-16 h-16 rounded-2xl bg-success/10 flex items-center justify-center mx-auto mb-3">
                          <CheckCircle2 className="w-8 h-8 text-success" />
                        </div>
                        <h2 className="text-xl font-bold">Verify OTP</h2>
                        <p className="text-sm text-muted-foreground mt-1">
                          Enter the 6-digit code sent to{" "}
                          <span className="font-semibold text-foreground">
                            {formatPhone(phone)}
                          </span>
                        </p>
                      </motion.div>

                      <motion.div variants={itemVariant}>
                        <OtpInput value={otp} onChange={setOtp} />
                      </motion.div>

                      <motion.div variants={itemVariant}>
                        <Button
                          type="submit"
                          className="w-full h-12 text-base font-bold rounded-xl bg-gradient-to-r from-primary to-primary/90 hover:from-primary/95 hover:to-primary/85 shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transition-all duration-300"
                          disabled={isLoading || otp.length !== 6}
                        >
                          {isLoading ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              Verifying...
                            </>
                          ) : (
                            <>
                              Verify &{" "}
                              {mode === "login" ? "Sign In" : "Create Account"}
                              <ArrowRight className="w-4 h-4 ml-2" />
                            </>
                          )}
                        </Button>
                      </motion.div>

                      <motion.div
                        variants={itemVariant}
                        className="text-center"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setOtpSent(false);
                            setOtp("");
                            setConfirmationResult(null);
                            setError("");
                          }}
                          className="text-sm text-muted-foreground hover:text-primary transition-colors font-medium"
                        >
                          ← Change phone number
                        </button>
                        <span className="mx-3 text-border">|</span>
                        <button
                          type="button"
                          onClick={handleSendOtp}
                          disabled={isLoading}
                          className="text-sm text-primary hover:text-primary/80 transition-colors font-semibold"
                        >
                          Resend OTP
                        </button>
                      </motion.div>
                    </motion.form>
                  )}
                </motion.div>
              ) : (
                /* ─── Insurer Auth ──────────────────────────── */
                <motion.form
                  key="insurer"
                  onSubmit={
                    mode === "login" ? handleInsurerLogin : handleInsurerSignup
                  }
                  {...fadeSlide}
                >
                  <motion.div
                    variants={stagger}
                    initial="initial"
                    animate="animate"
                    className="space-y-4"
                  >
                    <motion.h2
                      variants={itemVariant}
                      className="text-xl font-bold text-center mb-1"
                    >
                      {mode === "login"
                        ? "Command Center"
                        : "Create Insurer Account"}
                    </motion.h2>
                    <motion.p
                      variants={itemVariant}
                      className="text-sm text-muted-foreground text-center mb-4"
                    >
                      {mode === "login"
                        ? "Access your insurer dashboard"
                        : "Set up your organization's access"}
                    </motion.p>

                    {mode === "signup" && (
                      <motion.div variants={itemVariant}>
                        <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
                          Full Name
                        </label>
                        <div className="relative">
                          <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <input
                            type="text"
                            value={insurerName}
                            onChange={(e) => setInsurerName(e.target.value)}
                            className="w-full pl-10 pr-4 py-3.5 rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-medium"
                            placeholder="Organization Name"
                          />
                        </div>
                      </motion.div>
                    )}

                    <motion.div variants={itemVariant}>
                      <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
                        Email Address
                      </label>
                      <div className="relative">
                        <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <input
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="w-full pl-10 pr-4 py-3.5 rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-medium"
                          placeholder="admin@insurance.co"
                        />
                      </div>
                    </motion.div>

                    <motion.div variants={itemVariant}>
                      <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
                        Password
                      </label>
                      <div className="relative">
                        <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <input
                          type={showPassword ? "text" : "password"}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="w-full pl-10 pr-12 py-3.5 rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-medium"
                          placeholder="••••••••"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {showPassword ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </motion.div>

                    {mode === "signup" && (
                      <motion.div variants={itemVariant}>
                        <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
                          Confirm Password
                        </label>
                        <div className="relative">
                          <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <input
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            className="w-full pl-10 pr-4 py-3.5 rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-medium"
                            placeholder="••••••••"
                          />
                        </div>
                        {confirmPassword && password !== confirmPassword && (
                          <p className="text-xs text-destructive mt-1.5 font-medium">
                            Passwords do not match
                          </p>
                        )}
                      </motion.div>
                    )}

                    <motion.div variants={itemVariant}>
                      <Button
                        type="submit"
                        className="w-full h-12 text-base font-bold rounded-xl mt-2 bg-foreground text-background hover:bg-foreground/90 shadow-lg shadow-black/10 hover:shadow-xl transition-all duration-300"
                        disabled={isLoading}
                      >
                        {isLoading ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            {mode === "login"
                              ? "Authenticating..."
                              : "Creating Account..."}
                          </>
                        ) : (
                          <>
                            {mode === "login"
                              ? "Enter Command Center"
                              : "Create Account"}
                            <ArrowRight className="w-4 h-4 ml-2" />
                          </>
                        )}
                      </Button>
                    </motion.div>
                  </motion.div>
                </motion.form>
              )}
            </AnimatePresence>

            {/* Security badge */}
            <div className="mt-6 pt-5 border-t border-border/60 flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <Shield className="w-3.5 h-3.5" />
              <span>Secured with Firebase Authentication</span>
            </div>
          </motion.div>

          {/* reCAPTCHA container (invisible) */}
          <div id="recaptcha-container" ref={recaptchaContainerRef} />
        </div>
      </div>

      {/* ─── Right: Media Panel ──────────────────────────────── */}
      <div className="hidden lg:block lg:flex-1 relative overflow-hidden">
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
        <div className="absolute inset-0 bg-gradient-to-br from-primary/15 via-transparent to-black/20" />

        {/* Overlay content */}
        <div className="absolute inset-0 flex flex-col items-center justify-end p-12 pb-16 text-white">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.6 }}
            className="text-center max-w-lg"
          >
            <h2 className="font-display text-3xl font-bold mb-3 drop-shadow-lg">
              <span className="text-primary">Income Protection,</span>{" "}
              <span className="italic text-primary-foreground/90">
                Reimagined.
              </span>
            </h2>
            <p className="text-white/70 text-sm leading-relaxed">
              Auto-detect grid disruptions. Get instant payouts. Zero paperwork.
              Your safety net starts with a single sign-in.
            </p>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
