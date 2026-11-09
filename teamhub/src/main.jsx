import { Component, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import TeamHubRolesApp from "./TeamHubRoles.jsx";

// Error boundary: without one, any render-time throw unmounts the whole
// tree and the user sees a blank white page with no clue what happened.
// This catches the throw and shows a plain fallback (with a reload button)
// instead of nothing. (Added after the logs/{uid}/goal invalid-document
// crash blanked the app on every sign-in.)
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    console.error("Brophy Soccer crashed:", error);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
            padding: 24,
            background: "#980000",
            color: "#fff",
            fontFamily: "system-ui, sans-serif",
            textAlign: "center",
          }}
        >
          <h1 style={{ margin: 0, fontSize: 22 }}>Something went wrong</h1>
          <p style={{ margin: 0, opacity: 0.9 }}>
            Brophy Soccer hit an unexpected error. Reloading usually fixes it.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              padding: "12px 24px",
              fontSize: 16,
              borderRadius: 10,
              border: "none",
              background: "#fff",
              color: "#980000",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ErrorBoundary>
      <TeamHubRolesApp />
    </ErrorBoundary>
  </StrictMode>,
);
