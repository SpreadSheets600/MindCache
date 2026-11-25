import React from "react";
import { createRoot } from "react-dom/client";
import { SearchOverlay } from "./SearchOverlay";
import { extractCurrentPage } from "./extract-page";

console.log("[MindCache Content Script] Active on page:", window.location.href);

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action === "ping") {
    sendResponse({ status: "ok", url: window.location.href });
  }
  if (request.action === "extract-page") {
    extractCurrentPage().then(sendResponse);
    return true;
  }
  if (request.action === "extract-selection") {
    const sel = window.getSelection();
    const text = sel && !sel.isCollapsed ? sel.toString() : "";
    const html = text ? (() => {
      const range = sel!.getRangeAt(0);
      const fragment = range.cloneContents();
      const temp = document.createElement("div");
      temp.appendChild(fragment);
      return temp.innerHTML;
    })() : "";
    sendResponse({ text, html });
    return true;
  }
  return true;
});

function initOverlay() {
  if (document.getElementById("mindcache-search-overlay-host")) {
    return;
  }

  const host = document.createElement("div");
  host.id = "mindcache-search-overlay-host";
  
  host.style.position = "absolute";
  host.style.width = "0";
  host.style.height = "0";
  host.style.overflow = "visible";
  host.style.zIndex = "2147483647";

  const shadowRoot = host.attachShadow({ mode: "open" });
  const container = document.createElement("div");
  shadowRoot.appendChild(container);

  document.documentElement.appendChild(host);

  const root = createRoot(container);
  root.render(React.createElement(SearchOverlay));
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initOverlay);
} else {
  initOverlay();
}
