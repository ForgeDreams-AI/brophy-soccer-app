import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import TeamHubRolesApp from "./TeamHubRoles.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <TeamHubRolesApp />
  </StrictMode>,
);
