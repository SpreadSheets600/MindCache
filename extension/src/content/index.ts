import React from "react";
import { createRoot } from "react-dom/client";
import { SearchOverlay } from "./SearchOverlay";

console.log("[MindCache Content Script] Active on page:", window.location.href);

// Expose standard hook or event receiver for verifying script status
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action === "ping") {
    sendResponse({ status: "ok", url: window.location.href });
  }
  return true;
});

function initOverlay() {
  // Prevent duplicate mounts on SPAs or script re-injections
  if (document.getElementById("mindcache-search-overlay-host")) {
    return;
  }

  const host = document.createElement("div");
  host.id = "mindcache-search-overlay-host";
  
  // Clean, zero-impact positioning in host page
  host.style.position = "absolute";
  host.style.width = "0";
  host.style.height = "0";
  host.style.overflow = "visible";
  host.style.zIndex = "2147483647";

  const shadowRoot = host.attachShadow({ mode: "open" });
  const container = document.createElement("div");
  shadowRoot.appendChild(container);

  // Append to documentElement for maximum stability
  document.documentElement.appendChild(host);

  const root = createRoot(container);
  root.render(React.createElement(SearchOverlay));
}

// Initialize once the document structure is available
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initOverlay);
} else {
  initOverlay();
}
