import { createRoot } from "react-dom/client";
import { setBaseUrl } from "@workspace/api-client-react"; // Add this import
import App from "./App";
import "./index.css";

// Set the base URL for all API requests to point to your Express server
setBaseUrl("http://localhost:5000");

createRoot(document.getElementById("root")!).render(<App />);