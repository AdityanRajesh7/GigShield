import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/store/auth";
import { useState } from "react";
import { toast } from "sonner";
import { User, BellRing, ShieldCheck } from "lucide-react";

export function Settings() {
  const { worker, role } = useAuth();
  const [activeTab, setActiveTab] = useState("profile");
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 800));
      toast.success("Settings saved successfully.");
    } catch {
      toast.error("Failed to save settings.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto space-y-8 pb-12">
        <div>
          <h1 className="text-3xl font-display font-bold">Settings</h1>
          <p className="text-muted-foreground mt-1">Manage your account preferences and security.</p>
        </div>

        <div className="flex flex-col md:flex-row gap-8">
          {/* Sidebar Nav */}
          <div className="w-full md:w-64 shrink-0 space-y-1">
            <button
              onClick={() => setActiveTab("profile")}
              className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl text-sm font-bold transition-all ${
                activeTab === "profile" ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              <User className="w-4 h-4" /> Profile Details
            </button>
            <button
              onClick={() => setActiveTab("notifications")}
              className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl text-sm font-bold transition-all ${
                activeTab === "notifications" ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              <BellRing className="w-4 h-4" /> Notifications
            </button>
            <button
              onClick={() => setActiveTab("security")}
              className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl text-sm font-bold transition-all ${
                activeTab === "security" ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              <ShieldCheck className="w-4 h-4" /> Security
            </button>
          </div>

          {/* Main Content Area */}
          <div className="flex-1">
            <div className="bg-card border border-border rounded-3xl p-6 shadow-sm">
              <form onSubmit={handleSave} className="space-y-6">
                {activeTab === "profile" && (
                  <div className="space-y-6 animate-in fade-in-50">
                    <h2 className="text-xl font-bold font-display border-b border-border/50 pb-4">Profile Details</h2>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-sm font-bold text-muted-foreground">Full Name</label>
                        <input
                          type="text"
                          defaultValue={worker?.name || ""}
                          className="w-full bg-muted border-transparent rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
                          placeholder="Your Name"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-bold text-muted-foreground">Phone Number</label>
                        <input
                          type="text"
                          defaultValue={worker?.phone || ""}
                          className="w-full bg-muted border-transparent rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
                          placeholder="+91 00000 00000"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-bold text-muted-foreground">Role</label>
                        <input
                          type="text"
                          defaultValue={role === 'insurer' ? 'Insurer / Admin' : 'Worker'}
                          disabled
                          className="w-full bg-muted/50 text-muted-foreground border-transparent rounded-xl px-4 py-2 text-sm cursor-not-allowed outline-none"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === "notifications" && (
                  <div className="space-y-6 animate-in fade-in-50">
                    <h2 className="text-xl font-bold font-display border-b border-border/50 pb-4">Notification Preferences</h2>
                    <div className="space-y-4">
                      <label className="flex items-center justify-between p-4 bg-muted rounded-xl cursor-pointer">
                        <div>
                          <p className="font-bold text-sm">Zone Disruptions</p>
                          <p className="text-xs text-muted-foreground">Receive alerts for grid failures or extreme weather in your assigned zone.</p>
                        </div>
                        <input type="checkbox" defaultChecked className="w-5 h-5 accent-primary" />
                      </label>
                      <label className="flex items-center justify-between p-4 bg-muted rounded-xl cursor-pointer">
                        <div>
                          <p className="font-bold text-sm">Claim Updates</p>
                          <p className="text-xs text-muted-foreground">Get notified when a claim is approved, required, or rejected.</p>
                        </div>
                        <input type="checkbox" defaultChecked className="w-5 h-5 accent-primary" />
                      </label>
                      <label className="flex items-center justify-between p-4 bg-muted rounded-xl cursor-pointer">
                        <div>
                          <p className="font-bold text-sm">Premium Payments</p>
                          <p className="text-xs text-muted-foreground">Alerts for upcoming or missed premium renewals.</p>
                        </div>
                        <input type="checkbox" defaultChecked className="w-5 h-5 accent-primary" />
                      </label>
                    </div>
                  </div>
                )}

                {activeTab === "security" && (
                  <div className="space-y-6 animate-in fade-in-50">
                    <h2 className="text-xl font-bold font-display border-b border-border/50 pb-4">Security Settings</h2>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-sm font-bold text-muted-foreground">Current Password</label>
                        <input
                          type="password"
                          className="w-full bg-muted border-transparent rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
                          placeholder="••••••••"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-bold text-muted-foreground">New Password</label>
                        <input
                          type="password"
                          className="w-full bg-muted border-transparent rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
                          placeholder="••••••••"
                        />
                      </div>
                      <div className="pt-2">
                        <label className="flex items-center gap-3">
                          <input type="checkbox" className="w-4 h-4 accent-primary" />
                          <span className="text-sm font-medium">Enable Two-Factor Authentication (2FA)</span>
                        </label>
                      </div>
                    </div>
                  </div>
                )}

                <div className="pt-6 border-t border-border/50 flex justify-end">
                  <Button type="submit" disabled={isSaving} className="font-bold px-8">
                    {isSaving ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
