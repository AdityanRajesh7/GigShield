import { Router, Request, Response } from "express";

// Keep track of connected SSE clients
let clients: { id: string; res: Response }[] = [];

// Exported function to broadcast a notification to all connected clients
export const broadcastNotification = (data: any) => {
  clients.forEach((client) => {
    try {
      client.res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (e) {
      console.error("Failed to write to SSE client", e);
    }
  });
};

const router = Router();

router.get("/notifications/stream", (req: Request, res: Response) => {
  // Set headers for Server-Sent Events
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  // Send an initial connected event so the client knows it worked
  res.write(`data: ${JSON.stringify({ type: "CONNECTION_ESTABLISHED" })}\n\n`);

  const clientId = Date.now().toString();
  const newClient = { id: clientId, res };
  clients.push(newClient);

  req.on("close", () => {
    clients = clients.filter((client) => client.id !== clientId);
  });
});

// A test endpoint to simulate a notification, for manual verification
router.post("/notifications/test", (req: Request, res: Response) => {
  const { title, message, role } = req.body;
  broadcastNotification({
    id: Date.now().toString(),
    title: title || "Test Notification",
    message: message || "This is a broadcasted test event.",
    role: role || "all", // "worker", "insurer", or "all"
    timestamp: new Date().toISOString()
  });
  res.json({ success: true, clientsConnected: clients.length });
});

export default router;
