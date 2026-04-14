import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, Shield, FileText, CreditCard, 
  Map as MapIcon, Activity, ClipboardList, BarChart2, 
  Users, LogOut, Bell, Settings as SettingsIcon, Wallet
} from "lucide-react";
import { useAuth } from "@/store/auth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useNotifications } from "@/hooks/useNotifications";

export function AppLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { role, worker, logout } = useAuth();
  const { notifications, unreadCount, markAllAsRead } = useNotifications();

  const workerNav = [
    { name: "Overview", href: "/dashboard", icon: LayoutDashboard },
    { name: "My Policy", href: "/policy", icon: Shield },
    { name: "Claims", href: "/claims", icon: FileText },
    { name: "Wallet", href: "/wallet", icon: Wallet },
    { name: "Live Map", href: "/map", icon: MapIcon },
    { name: "Settings", href: "/settings", icon: SettingsIcon },
  ];

  const insurerNav = [
    { name: "Dashboard", href: "/insurer", icon: LayoutDashboard },
    { name: "Claims Queue", href: "/insurer/claims", icon: ClipboardList },
    { name: "Fraud Engine", href: "/insurer/fraud", icon: Activity },
    { name: "Analytics", href: "/insurer/analytics", icon: BarChart2 },
    { name: "Workers", href: "/insurer/workers", icon: Users },
    { name: "Live Map", href: "/map", icon: MapIcon },
    { name: "Settings", href: "/settings", icon: SettingsIcon },
  ];

  const nav = role === 'insurer' ? insurerNav : workerNav;

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <aside className="w-[260px] flex-shrink-0 border-r border-border bg-card flex flex-col justify-between hidden md:flex">
        <div>
          <div className="h-20 flex items-center px-6 border-b border-border/50">
            <Link href={role === 'insurer' ? '/insurer' : '/dashboard'} className="flex items-center gap-3 group">
              <div className="w-12 h-12 rounded-xl bg-primary/5 flex items-center justify-center group-hover:scale-105 transition-transform overflow-hidden">
                <img 
                  src="/images/logo.png" 
                  alt="HustleSafe" 
                  className="w-10 h-10 object-contain scale-110"
                />
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
            <DropdownMenu onOpenChange={(open) => { if (open) markAllAsRead(); }}>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="rounded-full relative">
                  <Bell className="w-4 h-4 text-muted-foreground" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground ring-2 ring-card animate-in zoom-in">
                      {unreadCount}
                    </span>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80 max-h-[400px] overflow-y-auto">
                <DropdownMenuLabel>Live Notifications</DropdownMenuLabel>
                <DropdownMenuSeparator />
                
                {notifications.length === 0 ? (
                  <div className="p-4 text-center text-sm text-muted-foreground">
                    No new notifications
                  </div>
                ) : (
                  notifications.map((notif) => (
                    <DropdownMenuItem key={notif.id} className="cursor-default">
                      <div className="flex flex-col gap-0.5 w-full">
                        <div className="flex justify-between items-start">
                          <span className="font-semibold text-sm">{notif.title}</span>
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(notif.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <span className="text-xs text-muted-foreground whitespace-pre-wrap">{notif.message}</span>
                      </div>
                    </DropdownMenuItem>
                  ))
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="w-10 h-10 rounded-full bg-muted border border-border flex items-center justify-center font-bold text-sm text-foreground hover:ring-2 hover:ring-primary/20 transition-all outline-none">
                  {role === 'insurer' ? 'IN' : worker?.name?.charAt(0) || 'U'}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>My Account</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/settings" className="w-full cursor-pointer">Settings</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={logout} className="text-destructive font-bold cursor-pointer">
                  <LogOut className="w-4 h-4 mr-2" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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
