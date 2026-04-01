import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, Shield, FileText, CreditCard, 
  Map as MapIcon, Activity, ClipboardList, BarChart2, 
  Users, LogOut, Bell
} from "lucide-react";
import { useAuth } from "@/store/auth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";

export function AppLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { role, worker, logout } = useAuth();

  const workerNav = [
    { name: "Overview", href: "/dashboard", icon: LayoutDashboard },
    { name: "My Policy", href: "/policy", icon: Shield },
    { name: "Claims", href: "/claims", icon: FileText },
    { name: "Live Map", href: "/map", icon: MapIcon },
  ];

  const insurerNav = [
    { name: "Dashboard", href: "/insurer", icon: LayoutDashboard },
    { name: "Claims Queue", href: "/insurer/claims", icon: ClipboardList },
    { name: "Analytics", href: "/insurer/analytics", icon: BarChart2 },
    { name: "Workers", href: "/insurer/workers", icon: Users },
    { name: "Live Map", href: "/map", icon: MapIcon },
  ];

  const nav = role === 'insurer' ? insurerNav : workerNav;

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <aside className="w-[260px] flex-shrink-0 border-r border-border bg-card flex flex-col justify-between hidden md:flex">
        <div>
          <div className="h-20 flex items-center px-6 border-b border-border/50">
            <Link href={role === 'insurer' ? '/insurer' : '/dashboard'} className="flex items-center gap-3 group">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground shadow-lg shadow-primary/20 group-hover:scale-105 transition-transform">
                <Shield className="w-4 h-4" />
              </div>
              <div>
                <span className="font-display font-bold text-xl tracking-tight text-foreground leading-none">HustleSafe</span>
                {role === 'insurer' && <span className="block text-[10px] font-bold text-primary tracking-widest uppercase">Insurer Portal</span>}
              </div>
            </Link>
          </div>

          <div className="px-4 py-6">
            {role === 'worker' && worker && (
              <div className="mb-8 px-2">
                <div className="text-sm font-bold text-foreground">{worker.name}</div>
                <div className="text-xs text-muted-foreground flex items-center gap-1.5 mt-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-success"></span>
                  {(worker?.zone_id || 'UNKNOWN').replace('_', ' ').toUpperCase()}
                </div>
              </div>
            )}

            <nav className="space-y-1">
              {nav.map((item) => {
                const isActive = location === item.href;
                return (
                  <Link 
                    key={item.name} 
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all relative overflow-hidden",
                      isActive 
                        ? "text-primary bg-primary/10" 
                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    )}
                  >
                    {isActive && (
                      <motion.div 
                        layoutId="sidebar-active"
                        className="absolute left-0 top-0 bottom-0 w-1 bg-primary"
                      />
                    )}
                    <item.icon className="w-4 h-4" />
                    {item.name}
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>

        <div className="p-4 border-t border-border/50">
          <button 
            onClick={logout}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all w-full"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 bg-background/50">
        <header className="h-20 flex-shrink-0 border-b border-border/50 bg-card/50 backdrop-blur-md flex items-center justify-end px-8 sticky top-0 z-40">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="icon" className="rounded-full relative">
              <Bell className="w-4 h-4 text-muted-foreground" />
              <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-primary ring-2 ring-card"></span>
            </Button>
            <div className="w-10 h-10 rounded-full bg-muted border border-border flex items-center justify-center font-bold text-sm text-foreground">
              {role === 'insurer' ? 'IN' : worker?.name?.charAt(0) || 'U'}
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-auto p-4 md:p-8">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="max-w-7xl mx-auto h-full"
          >
            {children}
          </motion.div>
        </div>
      </main>
    </div>
  );
}
