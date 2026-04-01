import { Link } from "wouter";
import {
  Shield,
  Zap,
  TrendingDown,
  ChevronRight,
  Lock,
  Activity,
} from "lucide-react";
import { motion } from "framer-motion";
import LiquidEther from "@/components/LiquidEther";
import "@/components/LiquidEther.css";

export function Landing() {
  return (
    <div className="min-h-screen bg-transparent text-foreground font-sans relative">
      {/* Full-page LiquidEther background */}
      <div className="fixed inset-0 -z-20">
        <LiquidEther
          colors={["#5227FF", "#FF9FFC", "#B19EEF"]}
          mouseForce={15}
          cursorSize={80}
          isViscous
          viscous={20}
          iterationsViscous={16}
          iterationsPoisson={16}
          resolution={0.7}
          isBounce={false}
          autoDemo
          autoSpeed={0.3}
          autoIntensity={1.5}
          takeoverDuration={0.25}
          autoResumeDelay={4000}
          autoRampDuration={0.8}
        />
      </div>

      <nav className="fixed top-0 w-full h-20 border-b border-border/50 bg-white backdrop-blur-md z-50 flex items-center px-6 md:px-12 justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground">
            <Shield className="w-4 h-4" />
          </div>
          <span className="font-display font-bold text-xl tracking-tight">
            HustleSafe
          </span>
        </div>
        <Link
          href="/auth"
          className="px-6 py-2.5 rounded-full bg-foreground text-background font-semibold text-sm hover:bg-foreground/90 transition-colors shadow-lg shadow-black/10"
        >
          Sign In
        </Link>
      </nav>

      <main>
        {/* Hero */}
        <section className="relative pt-32 pb-20 md:pt-48 md:pb-32 px-6 overflow-hidden">
          <div className="max-w-4xl mx-auto text-center relative z-10">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <span className="px-4 py-1.5 rounded-full bg-primary/10 text-primary font-bold text-xs uppercase tracking-widest border border-primary/20 inline-block mb-8">
                Parametric Income Protection
              </span>
              <h1 className="font-display text-5xl md:text-7xl font-bold tracking-tight leading-[1.1] mb-8 text-balance">
                Income Protection That <br className="hidden md:block" /> Thinks{" "}
                <span className="italic text-primary">Faster</span> Than Storms.
              </h1>
              <p className="text-lg md:text-xl text-muted-foreground mb-12 max-w-2xl mx-auto leading-relaxed">
                When heavy rain or civil disruptions hit your delivery zone,
                your income shouldn't drop to zero. HustleSafe auto-detects grid
                shutdowns and triggers instant payouts. No claims forms. No
                waiting.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link
                  href="/auth"
                  className="w-full sm:w-auto px-8 py-4 rounded-full bg-primary text-primary-foreground font-semibold text-base hover:bg-primary/90 hover:shadow-xl hover:shadow-primary/30 hover:-translate-y-0.5 transition-all duration-300 flex items-center justify-center gap-2"
                >
                  Protect Your Income
                  <ChevronRight className="w-4 h-4" />
                </Link>
                <div className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Lock className="w-4 h-4" /> Start from ₹15/week
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Stats Bar */}
        <section className="bg-foreground text-background py-16 px-6">
          <div className="max-w-6xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8 divide-x divide-background/20">
            <div className="text-center px-4">
              <div className="text-4xl font-display font-bold mb-2">2.8k+</div>
              <div className="text-xs text-background/60 uppercase tracking-widest font-bold">
                Workers Protected
              </div>
            </div>
            <div className="text-center px-4">
              <div className="text-4xl font-display font-bold mb-2 text-success">
                {"< 2m"}
              </div>
              <div className="text-xs text-background/60 uppercase tracking-widest font-bold">
                Avg Payout Time
              </div>
            </div>
            <div className="text-center px-4">
              <div className="text-4xl font-display font-bold mb-2">8</div>
              <div className="text-xs text-background/60 uppercase tracking-widest font-bold">
                Live BLR Zones
              </div>
            </div>
            <div className="text-center px-4">
              <div className="text-4xl font-display font-bold mb-2">Zero</div>
              <div className="text-xs text-background/60 uppercase tracking-widest font-bold">
                Claim Forms Filed
              </div>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="py-32 px-6 bg-white">
          <div className="text-center mb-20">
            <h2 className="font-display text-4xl font-bold mb-4">
              How Parametric Coverage Works
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              We use live data to protect your downside. If the delivery grid
              freezes, your payout fires.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-12 max-w-6xl mx-auto">
            {[
              {
                icon: Activity,
                title: "1. We Monitor The Grid",
                desc: "Our live Risk Map tracks rainfall, traffic, and platform demand drops in real-time.",
              },
              {
                icon: Zap,
                title: "2. Automatic Triggers",
                desc: "If your zone's Grid Disruption Score crosses the danger threshold, an event is declared.",
              },
              {
                icon: TrendingDown,
                title: "3. Instant Payout",
                desc: "Money is sent to your registered UPI instantly based on hours affected. Zero paperwork.",
              },
            ].map((step, i) => (
              <div
                key={i}
                className="bg-card p-8 rounded-3xl border border-border shadow-lg shadow-black/5 hover:border-primary/30 transition-colors"
              >
                <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center text-primary mb-6">
                  <step.icon className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold mb-3">{step.title}</h3>
                <p className="text-muted-foreground leading-relaxed">
                  {step.desc}
                </p>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
