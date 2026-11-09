import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "../theme/ThemeProvider";
import TeamHubApp from "./TeamHubApp";
import "../index.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ThemeProvider>
      <TeamHubApp />
    </ThemeProvider>
  </StrictMode>,
);
