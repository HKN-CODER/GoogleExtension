// background.js (MV3 service worker)
// Handles cross-origin POST to Google Apps Script Web App.

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== "SB_DELTA_GS_PUSH") {
    sendResponse({ ok: false, error: "ignored: not SB_DELTA_GS_PUSH" });
    return;
  }

  const url = msg.url;
  const params = msg.params;

  if (!url || typeof url !== "string") {
    sendResponse({ ok: false, error: "missing url" });
    return;
  }

  if (!params || typeof params !== "object") {
    sendResponse({ ok: false, error: "missing params" });
    return;
  }

  (async () => {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
        body: new URLSearchParams(params),
        redirect: "follow"
      });

      const text = await res.text();
      let json = null;
      try { json = JSON.parse(text); } catch {}

      sendResponse({
        ok: !!(json && json.ok),
        status: res.status,
        json,
        text
      });
    } catch (e) {
      sendResponse({ ok: false, error: String(e) });
    }
  })();

  return true; // keep message channel open for async response
});
