import { useState, useEffect } from "react";
import { useAuth } from "@/store/auth";

export interface NotificationEvent {
  id: string;
  title: string;
  message: string;
  role: "all" | "worker" | "insurer";
  timestamp: string;
}

export function useNotifications() {
  const { role } = useAuth();
  const [notifications, setNotifications] = useState<NotificationEvent[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    // Use relative path so Vite proxy (dev) or same-origin (prod) handles the route
    const eventSource = new EventSource(`/api/notifications/stream`);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === "CONNECTION_ESTABLISHED") {
          console.log("SSE Connection established");
          return;
        }

        // Filter notifications by role
        if (data.role === "all" || data.role === role) {
          setNotifications((prev) => [data, ...prev]);
          setUnreadCount((prev) => prev + 1);
        }
      } catch (err) {
        console.error("Failed to parse SSE message", err);
      }
    };

    eventSource.onerror = (err) => {
      console.error("SSE EventSource error:", err);
      // EventSource automatically attempts to reconnect
    };

    return () => {
      eventSource.close();
    };
  }, [role]);

  const markAllAsRead = () => {
    setUnreadCount(0);
  };

  const clearNotifications = () => {
    setNotifications([]);
    setUnreadCount(0);
  };

  return { notifications, unreadCount, markAllAsRead, clearNotifications };
}
