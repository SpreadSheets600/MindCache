console.log("[MindCache Content Script] Active on page:", window.location.href);

// Expose standard hook or event receiver if content scripts need communication
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action === "ping") {
    sendResponse({ status: "ok", url: window.location.href });
  }
  return true;
});
