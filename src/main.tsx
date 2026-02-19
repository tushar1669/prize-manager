import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { installGlobalErrorCapture } from "./lib/audit/globalErrorCapture";

installGlobalErrorCapture();

createRoot(document.getElementById("root")!).render(<App />);
