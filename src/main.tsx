import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { initOverviewStudioInventoryOnce } from "@/lib/overview/overview-studio-inventory-init";
import "./index.css";
import "@/components/pulse-assist/pulse-assist-theme.css";
import "@/components/organic-dashboard/organic-reporting-print.css";
import "@/components/organic-dashboard/organic-reporting-client-deck.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element '#root' not found in document");
}

initOverviewStudioInventoryOnce();

const root = createRoot(rootElement);
root.render(<App />);
