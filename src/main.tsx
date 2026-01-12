import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./style.css";

if (import.meta.env.DEV && window.location.origin == "https://tauri.localhost") {
  window.location.replace("http://127.0.0.1:1420/");
}

ReactDOM.createRoot(document.getElementById("app")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);