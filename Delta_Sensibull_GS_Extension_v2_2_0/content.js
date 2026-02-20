(() => {
  // ============================================================
  // SENSIBULL: DELTA RANGE TABLES (Calls + Puts) + Google Sheets Push
  // - UI: 2 buttons
  //   1) Show Table (toggle)
  //   2) Google Sheet Settings (toggle)
  // - Google Sheets:
  //   - Web App URL is hardcoded at the top (no token).
  //   - Interval: number + (seconds|minutes)
  //   - Auto push window: default 09:15 to 15:30 (user configurable)
  // ============================================================

  // ============================================================
  // Google Apps Script Web App URL (Hardcoded)
  // Replace this URL with your deployed Web App URL.
  // Example: https://script.google.com/macros/s/AKfycb.../exec
  // ============================================================
  const GS_WEBAPP_URL = "https://script.google.com/macros/s/AKfycbwk73Z-aeyLpl7DX8Azdp7VGrjRT7ix8R8Rr6HMulKfgLeLBn5iPO4neeH9S1kWLewA/exec";

  // Prevent double injection
  if (window.__SB_DELTA_GS_V1_LOADED__) return;
  window.__SB_DELTA_GS_V1_LOADED__ = true;

  const PANEL_ID = "sb-delta-tables-panel";
  const POS_KEY  = "sb_delta_tables_pos_v7";

  const KEY_MIN   = "sb_delta_tables_min_v7";
  const KEY_MAX   = "sb_delta_tables_max_v7";
  const KEY_SIZE  = "sb_delta_tables_size_v7"; // "S" | "M" | "L"

  const KEY_SHOW_TABLE    = "sb_delta_tables_show_table_v1";   // "1" | "0"
  const KEY_SHOW_GS       = "sb_delta_tables_show_gs_v1";      // "1" | "0"

  const KEY_GS_INT_NUM    = "sb_delta_gs_interval_num_v1";     // number
  const KEY_GS_INT_UNIT   = "sb_delta_gs_interval_unit_v1";    // "sec" | "min"
  const KEY_GS_START_TIME = "sb_delta_gs_start_time_v1";       // "HH:MM"
  const KEY_GS_END_TIME   = "sb_delta_gs_end_time_v1";         // "HH:MM"
  const KEY_GS_PAUSED     = "sb_delta_gs_paused_v1";           // "1" paused, "0" running


  const STYLE_ID  = "sb-delta-tables-style-v7";

  const UI = {
    zIndex: 2147483647,
    pad: 10,
    defaults: {
      pos: { left: 24, top: 140 },
      min: 0.4,
      max: 0.5,
      size: "S",
      showTable: true,
      showGS: false,
      intervalNum: 1,
      intervalUnit: "min",
      startTime: "09:15",
      endTime: "15:30",
      paused: false
    },
    updateMs: 400,
    // Interval bounds requested previously across your extensions
    bounds: {
      minMs: 1000,          // 1 second
      maxMs: 20 * 60 * 1000 // 20 minutes
    },
    colors: {
      panelBg: "#FFFFFF",
      headerBg: "#F3F4F6",
      rowBg:    "#F3F4F6",
      border:   "rgba(0,0,0,0.18)",
      borderSoft: "rgba(0,0,0,0.10)",
      grid: "rgba(0,0,0,0.10)",
      ok: "#0B7A24",
      warn: "#8A6D00",
      err: "#B00020"
    }
  };

  // ---------------- Utils ----------------
  function normalizeText(raw) {
    if (raw == null) return "";
    return String(raw)
      .replace(/[−–—]/g, "-")
      .replace(/\u00A0/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function parseFloatLoose(raw) {
    const s = normalizeText(raw).replace(/,/g, "");
    if (!s) return null;
    const m = s.match(/-?\d+(\.\d+)?/);
    if (!m) return null;
    const v = Number(m[0]);
    return Number.isFinite(v) ? v : null;
  }

  function loadJSON(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function saveJSON(key, obj) {
    try {
      localStorage.setItem(key, JSON.stringify(obj));
    } catch {}
  }

  function shouldIgnoreTarget(t) {
    const tag = (t?.tagName || "").toLowerCase();
    return tag === "input" || tag === "select" || tag === "button" || tag === "option" || tag === "label";
  }

  function clampToViewport(left, top, w, h) {
    const pad = UI.pad;
    const maxLeft = Math.max(pad, window.innerWidth - w - pad);
    const maxTop  = Math.max(pad, window.innerHeight - h - pad);
    return {
      left: Math.max(pad, Math.min(left, maxLeft)),
      top:  Math.max(pad, Math.min(top,  maxTop))
    };
  }

  function getRangeRaw() {
    const aRaw = Number(localStorage.getItem(KEY_MIN));
    const bRaw = Number(localStorage.getItem(KEY_MAX));
    const a = Number.isFinite(aRaw) ? aRaw : UI.defaults.min;
    const b = Number.isFinite(bRaw) ? bRaw : UI.defaults.max;
    return { a, b };
  }

  function getRangeAbs() {
    const { a, b } = getRangeRaw();
    const lo = Math.min(Math.abs(a), Math.abs(b));
    const hi = Math.max(Math.abs(a), Math.abs(b));
    return { lo, hi };
  }

  function setRange(a, b) {
    localStorage.setItem(KEY_MIN, String(a));
    localStorage.setItem(KEY_MAX, String(b));
  }

  function getPanelSize() {
    const v = localStorage.getItem(KEY_SIZE);
    return (v === "S" || v === "M" || v === "L") ? v : UI.defaults.size;
  }

  function setPanelSize(v) {
    localStorage.setItem(KEY_SIZE, v);
  }

  function getBoolKey(key, defBool) {
    const v = localStorage.getItem(key);
    if (v === "1") return true;
    if (v === "0") return false;
    return !!defBool;
  }

  function setBoolKey(key, boolVal) {
    localStorage.setItem(key, boolVal ? "1" : "0");
  }

  function getStrKey(key, defVal) {
    const v = localStorage.getItem(key);
    return (v != null && v !== "") ? String(v) : defVal;
  }

  function getNumKey(key, defVal) {
    const v = Number(localStorage.getItem(key));
    return Number.isFinite(v) ? v : defVal;
  }

  function setNumKey(key, n) {
    localStorage.setItem(key, String(n));
  }

  function fmtMoney2(v) {
    if (!Number.isFinite(v)) return "--";
    return v.toFixed(2);
  }

  function clamp(n, lo, hi) {
    return Math.max(lo, Math.min(hi, n));
  }

  function parseHHMM(hhmm) {
    const s = normalizeText(hhmm);
    const m = s.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const hh = Number(m[1]);
    const mm = Number(m[2]);
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
    return hh * 60 + mm;
  }

  function isWithinWindow(now, startHHMM, endHHMM) {
    const sMin = parseHHMM(startHHMM);
    const eMin = parseHHMM(endHHMM);
    if (sMin == null || eMin == null) return true; // fail-open

    const cur = now.getHours() * 60 + now.getMinutes();
    if (sMin <= eMin) return (cur >= sMin && cur <= eMin);
    // Overnight window (not expected here, but handle)
    return (cur >= sMin || cur <= eMin);
  }

  function computeIntervalMs(num, unit) {
    const n = clamp(Math.floor(Number(num)), 1, 20);
    const ms = (unit === "sec") ? (n * 1000) : (n * 60000);
    return clamp(ms, UI.bounds.minMs, UI.bounds.maxMs);
  }

  function formatTimeLocal(d) {
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  }

  // ---------------- Size presets ----------------
  const SIZE_PRESETS = {
    S: { width: 640, boxMaxH: 320, strike: 15, ltp: 13, delta: 11 },
    M: { width: 780, boxMaxH: 450, strike: 16, ltp: 14, delta: 12 },
    L: { width: 940, boxMaxH: 600, strike: 18, ltp: 15, delta: 13 }
  };

  function getPreset() {
    return SIZE_PRESETS[getPanelSize()] || SIZE_PRESETS.S;
  }

  // ---------------- Symbol detection (unchanged) ----------------
  function findSymbolFromTextBest(text) {
    const t = normalizeText(text).toUpperCase();
    if (!t) return null;

    const symPricePatterns = [
      { key: "BANKNIFTY", re: /\bBANKNIFTY\b\s*\d/i },
      { key: "SENSEX",    re: /\bSENSEX\b\s*\d/i },
      { key: "NIFTY",     re: /\bNIFTY\b\s*\d/i }
    ];

    let best = null;
    for (const p of symPricePatterns) {
      const m = t.match(p.re);
      if (m && typeof m.index === "number") {
        if (!best || m.index < best.idx) best = { key: p.key, idx: m.index };
      }
    }
    if (best) return best.key;

    const wordPatterns = [
      { key: "BANKNIFTY", re: /\bBANKNIFTY\b/i },
      { key: "SENSEX",    re: /\bSENSEX\b/i },
      { key: "NIFTY",     re: /\bNIFTY\b/i }
    ];

    best = null;
    for (const p of wordPatterns) {
      const m = t.match(p.re);
      if (m && typeof m.index === "number") {
        if (!best || m.index < best.idx) best = { key: p.key, idx: m.index };
      }
    }
    return best ? best.key : null;
  }

  function detectUnderlyingAndLot() {
    const url = new URL(location.href);

    const qp =
      (url.searchParams.get("symbol") ||
       url.searchParams.get("underlying") ||
       url.searchParams.get("tradingsymbol") ||
       url.searchParams.get("instrument") ||
       "") + "";

    const headerText = normalizeText(document.querySelector("header")?.innerText || "");
    const titleText  = normalizeText(document.title || "");

    const candidates = [ qp, headerText, titleText ];

    let sym = null;
    for (const c of candidates) {
      sym = findSymbolFromTextBest(c);
      if (sym) break;
    }

    if (sym === "BANKNIFTY") return { key: "BANKNIFTY", label: "BankNifty", lot: 35 };
    if (sym === "SENSEX")    return { key: "SENSEX",    label: "Sensex",    lot: 20 };
    if (sym === "NIFTY")     return { key: "NIFTY",     label: "Nifty",     lot: 75 };

    return { key: "UNKNOWN", label: "Delta Range", lot: 1 };
  }

  // ---------------- Sensibull DOM helpers ----------------
  function findOptionChainTable() {
    const t = document.querySelector("#oc_table_container table");
    if (t) return t;
    const c = document.querySelector("#oc_table_container");
    return c ? c.querySelector("table") : null;
  }

  function getStrikeIndexFromATMRow(table) {
    const atmRow = table.querySelector("tbody tr#oc_atm_row");
    if (!atmRow) return null;

    const tds = Array.from(atmRow.querySelectorAll("td"));
    if (!tds.length) return null;

    const strikeTd = atmRow.querySelector("td#oc_atm_strike");
    if (!strikeTd) return null;

    const idx = tds.indexOf(strikeTd);
    return idx >= 0 ? idx : null;
  }

  function computeIndices(table) {
    const strikeIdx = getStrikeIndexFromATMRow(table);
    if (strikeIdx == null) return null;

    const callDeltaIdx = strikeIdx - 3;
    const callLtpIdx   = strikeIdx - 1;
    const putLtpIdx    = strikeIdx + 1;
    const putDeltaIdx  = strikeIdx + 3;

    if (callDeltaIdx < 0 || callLtpIdx < 0) return null;
    return { strikeIdx, callDeltaIdx, callLtpIdx, putLtpIdx, putDeltaIdx };
  }

  function getStrikeValue(tr, tds, strikeIdx) {
    const v1 = parseFloatLoose(tds[strikeIdx]?.textContent);
    if (Number.isFinite(v1)) return v1;

    const v2 = parseFloatLoose(tr?.id);
    if (Number.isFinite(v2)) return v2;

    return null;
  }

  function scanDeltaMatches() {
    const table = findOptionChainTable();
    if (!table) return { ok: false };

    const idx = computeIndices(table);
    if (!idx) return { ok: false };

    const { lo, hi } = getRangeAbs();
    const rows = Array.from(table.querySelectorAll("tbody tr"));
    if (!rows.length) return { ok: false };

    const calls = [];
    const puts  = [];

    for (const tr of rows) {
      const tds = Array.from(tr.querySelectorAll("td"));
      if (!tds.length) continue;

      const needMax = Math.max(idx.strikeIdx, idx.callDeltaIdx, idx.callLtpIdx, idx.putLtpIdx, idx.putDeltaIdx);
      if (tds.length <= needMax) continue;

      const strike = getStrikeValue(tr, tds, idx.strikeIdx);
      if (!Number.isFinite(strike)) continue;

      const cDelta = parseFloatLoose(tds[idx.callDeltaIdx]?.textContent);
      const cLtp   = parseFloatLoose(tds[idx.callLtpIdx]?.textContent);

      const pLtp   = parseFloatLoose(tds[idx.putLtpIdx]?.textContent);
      const pDelta = parseFloatLoose(tds[idx.putDeltaIdx]?.textContent);

      if (Number.isFinite(cDelta) && Number.isFinite(cLtp)) {
        const a = Math.abs(cDelta);
        if (a >= lo && a <= hi) calls.push({ strike, ltp: cLtp, delta: cDelta });
      }

      if (Number.isFinite(pDelta) && Number.isFinite(pLtp)) {
        const a = Math.abs(pDelta);
        if (a >= lo && a <= hi) puts.push({ strike, ltp: pLtp, delta: pDelta });
      }
    }

    calls.sort((x, y) => x.strike - y.strike);
    puts.sort((x, y) => y.strike - x.strike);

    return { ok: true, calls, puts };
  }

  // ---------------- Styles ----------------
  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${PANEL_ID}{
        position: fixed;
        z-index: ${UI.zIndex};
        background: ${UI.colors.panelBg};
        border: 1px solid ${UI.colors.border};
        border-radius: 12px;
        box-shadow: 0 10px 24px rgba(0,0,0,0.18);
        padding: 10px 12px;
        font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial;
        color: #000;
        user-select: none;
        cursor: grab;

        width: var(--sbPanelW, 640px);
        --sbBoxMaxH: 320px;
        --sbStrikeSize: 15px;
        --sbLtpSize: 13px;
        --sbDeltaSize: 11px;
      }

      #${PANEL_ID} .sbTop{
        display:flex;
        align-items:flex-start;
        justify-content: space-between;
        gap: 10px;
        margin-bottom: 8px;
      }

      #${PANEL_ID} .sbTitleWrap{
        display:flex;
        flex-direction: column;
        gap: 4px;
        flex: 1 1 auto;
        padding-top: 2px;
      }

      #${PANEL_ID} .sbTitle{
        font-size: var(--sbStrikeSize);
        font-weight: 950;
        letter-spacing: 0.6px;
        line-height: 1.15;
      }

      #${PANEL_ID} .sbSubLine{
        font-size: var(--sbStrikeSize);
        font-weight: 950;
        letter-spacing: 0.3px;
        opacity: 0.95;
        line-height: 1.15;
      }

      #${PANEL_ID} .sbTopBtns{
        flex: 0 0 auto;
        display:flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 6px;
      }

      #${PANEL_ID} .sbRowBtns{
        display:flex;
        align-items:center;
        justify-content:flex-end;
        gap: 8px;
        flex-wrap: wrap;
      }

      #${PANEL_ID} .sbLbl{
        font-size: 11px;
        font-weight: 900;
        letter-spacing: 0.5px;
        opacity: 0.95;
      }

      #${PANEL_ID} input.sbIn{
        width: 76px;
        padding: 6px 8px;
        border-radius: 8px;
        border: 1px solid rgba(0,0,0,0.25);
        background: #F3F4F6;
        color: #000;
        outline: none;
        font-weight: 800;
      }

      #${PANEL_ID} input.sbInSmall{
        width: 64px;
      }

      #${PANEL_ID} input.sbTime{
        width: 108px;
        padding: 6px 8px;
        border-radius: 8px;
        border: 1px solid rgba(0,0,0,0.25);
        background: #F3F4F6;
        color: #000;
        outline: none;
        font-weight: 900;
      }

      #${PANEL_ID} select.sbSel{
        padding: 6px 8px;
        border-radius: 8px;
        border: 1px solid rgba(0,0,0,0.25);
        background: #F3F4F6;
        color: #000;
        outline: none;
        font-weight: 900;
        cursor: pointer;
        min-width: 110px;
      }

      #${PANEL_ID} select.sbSelSmall{
        min-width: 92px;
      }

      #${PANEL_ID} button.sbBtn{
        padding: 6px 10px;
        border-radius: 8px;
        border: 1px solid rgba(0,0,0,0.25);
        background: #E5E7EB;
        color: #000;
        cursor: pointer;
        font-weight: 900;
      }

      #${PANEL_ID} button.sbBtnPrimary{
        background: #D1D5DB;
      }

      #${PANEL_ID} .sbStatus{
        margin: 0 0 10px 0;
        padding: 6px 8px;
        border-radius: 10px;
        border: 1px solid ${UI.colors.borderSoft};
        background: ${UI.colors.headerBg};
        font-size: 11px;
        font-weight: 900;
        letter-spacing: 0.2px;
        display:flex;
        align-items:center;
        justify-content: space-between;
        gap: 8px;
      }

      #${PANEL_ID} .sbStatus .sbStatusText{
        overflow:hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      #${PANEL_ID} .sbSection{
        border: 1px solid ${UI.colors.borderSoft};
        border-radius: 12px;
        overflow: hidden;
        background: ${UI.colors.headerBg};
        margin-bottom: 10px;
      }

      #${PANEL_ID} .sbSectionHeader{
        padding: 7px 9px;
        font-size: 12px;
        font-weight: 950;
        letter-spacing: 0.6px;
        display:flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 1px solid ${UI.colors.grid};
        background: ${UI.colors.headerBg};
      }

      #${PANEL_ID} .sbSectionBody{
        padding: 10px;
        background: ${UI.colors.rowBg};
      }

      #${PANEL_ID} .sbFilterRow{
        display:flex;
        align-items:center;
        justify-content: flex-end;
        gap: 8px;
        flex-wrap: wrap;
        margin-bottom: 10px;
      }

      #${PANEL_ID} .sbBody{
        display:flex;
        gap: 12px;
        align-items: stretch;
      }

      #${PANEL_ID} .sbBox{
        flex: 1 1 0;
        border: 1px solid ${UI.colors.borderSoft};
        border-radius: 12px;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        min-width: 0;
        background: ${UI.colors.headerBg};
      }

      #${PANEL_ID} .sbBoxHeader{
        padding: 7px 9px;
        font-size: 12px;
        font-weight: 950;
        letter-spacing: 0.6px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        background: ${UI.colors.headerBg};
        border-bottom: 1px solid ${UI.colors.grid};
      }

      #${PANEL_ID} .sbCount{
        font-size: 12px;
        font-weight: 950;
        opacity: 0.95;
      }

      #${PANEL_ID} .sbScroll{
        overflow: auto;
        max-height: var(--sbBoxMaxH);
        background: ${UI.colors.rowBg};
      }

      #${PANEL_ID} table{
        width: 100%;
        border-collapse: collapse;
        table-layout: fixed;
        background: ${UI.colors.rowBg};
      }

      #${PANEL_ID} thead th{
        font-size: 11px;
        font-weight: 950;
        letter-spacing: 0.5px;
        padding: 6px 7px;
        text-align: right;
        background: ${UI.colors.headerBg};
        border-bottom: 1px solid ${UI.colors.grid};
        position: sticky;
        top: 0;
        z-index: 2;
        white-space: nowrap;
      }

      #${PANEL_ID} thead th:first-child,
      #${PANEL_ID} tbody td:first-child{
        text-align: left;
      }

      #${PANEL_ID} tbody tr{
        background: ${UI.colors.rowBg};
      }

      #${PANEL_ID} tbody td{
        padding: 6px 7px;
        border-bottom: 1px solid rgba(0,0,0,0.12);
        text-align: right;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        vertical-align: middle;
        background: ${UI.colors.rowBg};
      }

      #${PANEL_ID} td.sbStrike{
        font-size: var(--sbStrikeSize);
        font-weight: 950;
        letter-spacing: 0.2px;
      }

      #${PANEL_ID} td.sbLtp{
        font-size: var(--sbLtpSize);
        font-weight: 950;
      }

      #${PANEL_ID} td.sbDelta{
        font-size: var(--sbDeltaSize);
        font-weight: 900;
        opacity: 0.95;
      }

      #${PANEL_ID} .sbEmpty{
        padding: 10px;
        font-size: 12px;
        font-weight: 900;
        opacity: 0.85;
        text-align: center;
        background: ${UI.colors.rowBg};
      }

      #${PANEL_ID} .sbToast{
        position: absolute;
        right: 12px;
        bottom: 12px;
        padding: 8px 10px;
        border-radius: 10px;
        border: 1px solid rgba(0,0,0,0.18);
        background: #FFFFFF;
        box-shadow: 0 8px 18px rgba(0,0,0,0.18);
        font-size: 12px;
        font-weight: 950;
        max-width: calc(100% - 24px);
        white-space: nowrap;
        overflow:hidden;
        text-overflow: ellipsis;
        display:none;
      }
    `;
    document.head.appendChild(style);
  }

  // ---------------- Panel creation ----------------
  function applySizePreset(panel) {
    const preset = getPreset();
    panel.style.setProperty("--sbPanelW", `${preset.width}px`);
    panel.style.setProperty("--sbBoxMaxH", `${preset.boxMaxH}px`);
    panel.style.setProperty("--sbStrikeSize", `${preset.strike}px`);
    panel.style.setProperty("--sbLtpSize", `${preset.ltp}px`);
    panel.style.setProperty("--sbDeltaSize", `${preset.delta}px`);
  }

  function ensurePanel() {
    ensureStyles();

    let el = document.getElementById(PANEL_ID);
    if (el) return el;

    el = document.createElement("div");
    el.id = PANEL_ID;

    const { a, b } = getRangeRaw();
    const size = getPanelSize();
    const showTable = getBoolKey(KEY_SHOW_TABLE, UI.defaults.showTable);
    const showGS = getBoolKey(KEY_SHOW_GS, UI.defaults.showGS);

    const paused = getBoolKey(KEY_GS_PAUSED, UI.defaults.paused);

    const intNum = getNumKey(KEY_GS_INT_NUM, UI.defaults.intervalNum);
    const intUnit = getStrKey(KEY_GS_INT_UNIT, UI.defaults.intervalUnit);
    const startTime = getStrKey(KEY_GS_START_TIME, UI.defaults.startTime);
    const endTime = getStrKey(KEY_GS_END_TIME, UI.defaults.endTime);

    el.innerHTML = `
      <div class="sbTop">
        <div class="sbTitleWrap">
          <div class="sbTitle" data-role="panelTitle">DELTA RANGE TABLES</div>
          <div class="sbSubLine" data-role="panelSubLine">CALLS - --<br>PUTS - --</div>
        </div>

        <div class="sbTopBtns">
          <div class="sbRowBtns">
            <button class="sbBtn sbBtnPrimary" data-role="toggleTableBtn" type="button">${showTable ? "Hide Table" : "Show Table"}</button>
          </div>
          <div class="sbRowBtns">
            <button class="sbBtn" data-role="toggleGSBtn" type="button">Google Sheet Settings</button>
          </div>
        </div>
      </div>

      <div class="sbStatus" data-role="statusWrap">
        <div class="sbStatusText" data-role="statusText">Status: Ready</div>
        <div class="sbStatusText" data-role="lastPushText">Last push: --</div>
      </div>

      <div class="sbSection" data-role="tableSection" style="display:${showTable ? "block" : "none"};">
        <div class="sbSectionHeader">
          <span>Table</span>
          <span class="sbLbl">Filters / Size</span>
        </div>
        <div class="sbSectionBody">
          <div class="sbFilterRow">
            <span class="sbLbl">Min:</span>
            <input class="sbIn" data-role="minIn" type="number" step="0.01" value="${a}">
            <span class="sbLbl">Max:</span>
            <input class="sbIn" data-role="maxIn" type="number" step="0.01" value="${b}">

            <span class="sbLbl">Size:</span>
            <select class="sbSel" data-role="sizeSel">
              <option value="S">Small</option>
              <option value="M">Medium</option>
              <option value="L">Large</option>
            </select>

            <button class="sbBtn" data-role="saveFiltersBtn" type="button">Save</button>
          </div>

          <div class="sbBody">
            <div class="sbBox">
              <div class="sbBoxHeader">
                <span>CALLS</span>
                <span class="sbCount" data-role="callCount">0</span>
              </div>
              <div class="sbScroll">
                <table>
                  <thead>
                    <tr>
                      <th style="width:34%;">STRIKE</th>
                      <th style="width:38%;">LTP</th>
                      <th style="width:28%;">DELTA</th>
                    </tr>
                  </thead>
                  <tbody data-role="callBody"></tbody>
                </table>
                <div class="sbEmpty" data-role="callEmpty" style="display:none;">No matches</div>
              </div>
            </div>

            <div class="sbBox">
              <div class="sbBoxHeader">
                <span>PUTS</span>
                <span class="sbCount" data-role="putCount">0</span>
              </div>
              <div class="sbScroll">
                <table>
                  <thead>
                    <tr>
                      <th style="width:34%;">STRIKE</th>
                      <th style="width:38%;">LTP</th>
                      <th style="width:28%;">DELTA</th>
                    </tr>
                  </thead>
                  <tbody data-role="putBody"></tbody>
                </table>
                <div class="sbEmpty" data-role="putEmpty" style="display:none;">No matches</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="sbSection" data-role="gsSection" style="display:${showGS ? "block" : "none"};">
        <div class="sbSectionHeader">
          <span>Google Sheet Settings</span>
          <span class="sbLbl">Auto Push</span>
        </div>
        <div class="sbSectionBody">
          <div class="sbFilterRow" style="justify-content:flex-start;">
            <span class="sbLbl">Interval:</span>
            <input class="sbIn sbInSmall" data-role="gsIntNum" type="number" min="1" max="20" step="1" value="${intNum}">
            <select class="sbSel sbSelSmall" data-role="gsIntUnit">
              <option value="sec">Seconds</option>
              <option value="min">Minutes</option>
            </select>

            <span class="sbLbl" style="margin-left:8px;">Start:</span>
            <input class="sbTime" data-role="gsStart" type="time" value="${startTime}">

            <span class="sbLbl">End:</span>
            <input class="sbTime" data-role="gsEnd" type="time" value="${endTime}">

            <button class="sbBtn" data-role="gsSaveBtn" type="button">Save</button>
          </div>

          <div class="sbLbl" style="opacity:0.85;">
            Web App URL is hardcoded inside content.js. Token not used.
          </div>

          <div class="sbFilterRow" style="justify-content:flex-start; margin-top:8px;">
            <button class="sbBtn" data-role="gsPauseBtn" type="button">${paused ? "Resume Push" : "Pause Push"}</button>
            <span class="sbLbl" data-role="gsPauseState" style="opacity:0.85;">${paused ? "Push is paused" : "Push is running"}</span>
          </div>
        </div>
      </div>

      <div class="sbToast" data-role="toast"></div>
    `;

    // Position
    const saved = loadJSON(POS_KEY);
    const start = saved || UI.defaults.pos;
    el.style.left = `${start.left}px`;
    el.style.top  = `${start.top}px`;

    document.documentElement.appendChild(el);

    // Apply preset
    const sizeSel = el.querySelector("[data-role='sizeSel']");
    if (sizeSel) sizeSel.value = size;
    const unitSel = el.querySelector("[data-role='gsIntUnit']");
    if (unitSel) unitSel.value = (intUnit === "sec" || intUnit === "min") ? intUnit : UI.defaults.intervalUnit;

    applySizePreset(el);

    // Clamp after mount
    requestAnimationFrame(() => {
      const r = el.getBoundingClientRect();
      const fixed = clampToViewport(r.left, r.top, r.width, r.height);
      el.style.left = `${fixed.left}px`;
      el.style.top  = `${fixed.top}px`;
      saveJSON(POS_KEY, fixed);
    });

    // Events
    wirePanelEvents(el);

    // Drag
    wireDrag(el);

    return el;
  }

  function showToast(panel, msg) {
    const t = panel.querySelector("[data-role='toast']");
    if (!t) return;

    t.textContent = String(msg || "");
    t.style.display = "block";
    t.style.opacity = "1";

    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => {
      t.style.opacity = "0";
      setTimeout(() => {
        t.style.display = "none";
      }, 250);
    }, 1800);
  }

  function setStatus(panel, text, kind) {
    const st = panel.querySelector("[data-role='statusText']");
    if (!st) return;

    st.textContent = String(text || "");
    if (kind === "ok") st.style.color = UI.colors.ok;
    else if (kind === "warn") st.style.color = UI.colors.warn;
    else if (kind === "err") st.style.color = UI.colors.err;
    else st.style.color = "#000";
  }

  function setLastPush(panel, text, kind) {
    const lp = panel.querySelector("[data-role='lastPushText']");
    if (!lp) return;

    lp.textContent = String(text || "");
    if (kind === "ok") lp.style.color = UI.colors.ok;
    else if (kind === "warn") lp.style.color = UI.colors.warn;
    else if (kind === "err") lp.style.color = UI.colors.err;
    else lp.style.color = "#000";
  }

  function wirePanelEvents(panel) {
    const tableSection = panel.querySelector("[data-role='tableSection']");
    const gsSection = panel.querySelector("[data-role='gsSection']");

    const toggleTableBtn = panel.querySelector("[data-role='toggleTableBtn']");
    const toggleGSBtn = panel.querySelector("[data-role='toggleGSBtn']");

    toggleTableBtn?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const isOpen = (tableSection?.style.display !== "none");
      if (tableSection) tableSection.style.display = isOpen ? "none" : "block";
      setBoolKey(KEY_SHOW_TABLE, !isOpen);
      if (toggleTableBtn) toggleTableBtn.textContent = (!isOpen) ? "Hide Table" : "Show Table";
      requestAnimationFrame(() => {
        const r = panel.getBoundingClientRect();
        const fixed = clampToViewport(r.left, r.top, r.width, r.height);
        panel.style.left = `${fixed.left}px`;
        panel.style.top  = `${fixed.top}px`;
        saveJSON(POS_KEY, fixed);
      });
    });

    toggleGSBtn?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const isOpen = (gsSection?.style.display !== "none");
      if (gsSection) gsSection.style.display = isOpen ? "none" : "block";
      setBoolKey(KEY_SHOW_GS, !isOpen);
      showToast(panel, (!isOpen) ? "Google Sheet settings opened" : "Google Sheet settings hidden");
      requestAnimationFrame(() => {
        const r = panel.getBoundingClientRect();
        const fixed = clampToViewport(r.left, r.top, r.width, r.height);
        panel.style.left = `${fixed.left}px`;
        panel.style.top  = `${fixed.top}px`;
        saveJSON(POS_KEY, fixed);
      });
    });

    // Filter save
    const minIn = panel.querySelector("[data-role='minIn']");
    const maxIn = panel.querySelector("[data-role='maxIn']");
    const sizeSel = panel.querySelector("[data-role='sizeSel']");
    const saveFiltersBtn = panel.querySelector("[data-role='saveFiltersBtn']");

    const saveFilters = () => {
      const a = Number(minIn?.value);
      const b = Number(maxIn?.value);

      let ok = true;
      if (Number.isFinite(a) && Number.isFinite(b)) {
        setRange(a, b);
      } else {
        ok = false;
      }

      const sz = (sizeSel && (sizeSel.value === "S" || sizeSel.value === "M" || sizeSel.value === "L"))
        ? sizeSel.value
        : "S";
      setPanelSize(sz);
      applySizePreset(panel);

      update();

      if (ok) {
        showToast(panel, "Saved");
        setStatus(panel, "Status: Saved filters", "ok");
      } else {
        showToast(panel, "Save failed (check Min/Max)");
        setStatus(panel, "Status: Save failed (Min/Max)", "err");
      }
    };

    saveFiltersBtn?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      saveFilters();
    });

    sizeSel?.addEventListener("change", () => {
      const sz = (sizeSel.value === "S" || sizeSel.value === "M" || sizeSel.value === "L") ? sizeSel.value : "S";
      setPanelSize(sz);
      applySizePreset(panel);
      requestAnimationFrame(() => {
        const r = panel.getBoundingClientRect();
        const fixed = clampToViewport(r.left, r.top, r.width, r.height);
        panel.style.left = `${fixed.left}px`;
        panel.style.top  = `${fixed.top}px`;
        saveJSON(POS_KEY, fixed);
      });
    });

    // GS save
    const gsIntNum = panel.querySelector("[data-role='gsIntNum']");
    const gsIntUnit = panel.querySelector("[data-role='gsIntUnit']");
    const gsStart = panel.querySelector("[data-role='gsStart']");
    const gsEnd = panel.querySelector("[data-role='gsEnd']");
    const gsSaveBtn = panel.querySelector("[data-role='gsSaveBtn']");

    const saveGS = () => {
      const n = clamp(Math.floor(Number(gsIntNum?.value)), 1, 20);
      const unit = (gsIntUnit?.value === "sec" || gsIntUnit?.value === "min") ? gsIntUnit.value : UI.defaults.intervalUnit;
      const start = normalizeText(gsStart?.value || "");
      const end = normalizeText(gsEnd?.value || "");

      if (parseHHMM(start) == null || parseHHMM(end) == null) {
        showToast(panel, "Save failed (invalid time)");
        setStatus(panel, "Status: Save failed (invalid time)", "err");
        return;
      }

      setNumKey(KEY_GS_INT_NUM, n);
      localStorage.setItem(KEY_GS_INT_UNIT, unit);
      localStorage.setItem(KEY_GS_START_TIME, start);
      localStorage.setItem(KEY_GS_END_TIME, end);

      applyPushScheduler(true);

      showToast(panel, "Saved");
      setStatus(panel, "Status: Saved Google Sheet settings", "ok");
    };

    gsSaveBtn?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      saveGS();
    });

    // GS Pause/Resume
    const gsPauseBtn = panel.querySelector("[data-role='gsPauseBtn']");

    const setPaused = (wantPaused) => {
      setBoolKey(KEY_GS_PAUSED, !!wantPaused);

      // Update button label
      if (gsPauseBtn) gsPauseBtn.textContent = wantPaused ? "Resume Push" : "Pause Push";

      const pauseState = panel.querySelector("[data-role='gsPauseState']");
      if (pauseState) pauseState.textContent = wantPaused ? 'Push is paused' : 'Push is running';

      if (wantPaused) {
        // Stop timers
        if (pushTimer) { clearInterval(pushTimer); pushTimer = null; }
        if (windowWatcher) { clearInterval(windowWatcher); windowWatcher = null; }
        setStatus(panel, "Status: Push paused (manual)", "warn");
        showToast(panel, "Push paused");
      } else {
        // Resume scheduler
        applyPushScheduler(true);
        const s = getGSSettings();
        const now = new Date();
        if (isWithinWindow(now, s.startTime, s.endTime)) {
          setStatus(panel, "Status: Push resumed", "ok");
        } else {
          setStatus(panel, "Status: Push paused (outside time window)", "warn");
        }
        showToast(panel, "Push resumed");
      }
    };

    gsPauseBtn?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const cur = getBoolKey(KEY_GS_PAUSED, UI.defaults.paused);
      setPaused(!cur);
    });
  }

  function wireDrag(panel) {
    let dragging = false;
    let startX = 0, startY = 0, startLeft = 0, startTop = 0;

    panel.addEventListener("pointerdown", (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      if (shouldIgnoreTarget(e.target)) return;

      dragging = true;
      panel.style.cursor = "grabbing";

      const rect = panel.getBoundingClientRect();
      startX = e.clientX;
      startY = e.clientY;
      startLeft = rect.left;
      startTop  = rect.top;

      panel.setPointerCapture?.(e.pointerId);
      e.preventDefault();
      e.stopPropagation();
    });

    panel.addEventListener("pointermove", (e) => {
      if (!dragging) return;

      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      const rect = panel.getBoundingClientRect();
      const next = clampToViewport(startLeft + dx, startTop + dy, rect.width, rect.height);

      panel.style.left = `${next.left}px`;
      panel.style.top  = `${next.top}px`;

      e.preventDefault();
      e.stopPropagation();
    });

    const endDrag = (e) => {
      if (!dragging) return;
      dragging = false;
      panel.style.cursor = "grab";

      const rect = panel.getBoundingClientRect();
      saveJSON(POS_KEY, { left: rect.left, top: rect.top });

      e.preventDefault?.();
      e.stopPropagation?.();
    };

    panel.addEventListener("pointerup", endDrag);
    panel.addEventListener("pointercancel", endDrag);

    window.addEventListener("resize", () => {
      const rect = panel.getBoundingClientRect();
      const next = clampToViewport(rect.left, rect.top, rect.width, rect.height);
      panel.style.left = `${next.left}px`;
      panel.style.top  = `${next.top}px`;
      saveJSON(POS_KEY, { left: next.left, top: next.top });
    }, { passive: true });
  }

  // ---------------- Render ----------------
  function renderTables(panel, calls, puts) {
    const callBody  = panel.querySelector("[data-role='callBody']");
    const putBody   = panel.querySelector("[data-role='putBody']");
    const callCount = panel.querySelector("[data-role='callCount']");
    const putCount  = panel.querySelector("[data-role='putCount']");
    const callEmpty = panel.querySelector("[data-role='callEmpty']");
    const putEmpty  = panel.querySelector("[data-role='putEmpty']");

    if (!callBody || !putBody || !callCount || !putCount || !callEmpty || !putEmpty) return;

    callCount.textContent = String(calls.length);
    putCount.textContent  = String(puts.length);

    callBody.innerHTML = "";
    putBody.innerHTML  = "";

    if (!calls.length) {
      callEmpty.style.display = "block";
    } else {
      callEmpty.style.display = "none";
      for (const r of calls) {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td class="sbStrike">${Math.round(r.strike)}</td>
          <td class="sbLtp">${r.ltp.toFixed(2)}</td>
          <td class="sbDelta">${r.delta.toFixed(2)}</td>
        `;
        callBody.appendChild(tr);
      }
    }

    if (!puts.length) {
      putEmpty.style.display = "block";
    } else {
      putEmpty.style.display = "none";
      for (const r of puts) {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td class="sbStrike">${Math.round(r.strike)}</td>
          <td class="sbLtp">${r.ltp.toFixed(2)}</td>
          <td class="sbDelta">${r.delta.toFixed(2)}</td>
        `;
        putBody.appendChild(tr);
      }
    }
  }

  function computeHeaderValues(calls, puts) {
    const u = detectUnderlyingAndLot();

    // Existing behavior: use LAST row from each table
    const callLast = calls.length ? calls[calls.length - 1] : null;
    const putLast  = puts.length ? puts[puts.length - 1] : null;

    const callVal = callLast ? (callLast.ltp * u.lot) : null;
    const putVal  = putLast  ? (putLast.ltp  * u.lot) : null;

    const title = (u.key === "UNKNOWN") ? "Delta Range" : `${u.label} Delta Range`;

    return {
      underlying: u,
      title,
      callVal,
      putVal
    };
  }

  function updateHeaderTexts(panel, calls, puts) {
    const titleEl = panel.querySelector("[data-role='panelTitle']");
    const subEl   = panel.querySelector("[data-role='panelSubLine']");
    if (!titleEl || !subEl) return;

    const hv = computeHeaderValues(calls, puts);

    titleEl.textContent = hv.title;
    subEl.innerHTML = `CALLS - ${fmtMoney2(hv.callVal)}<br>PUTS - ${fmtMoney2(hv.putVal)}`;
  }

  function update() {
    const panel = ensurePanel();
    if (panel.style.cursor !== "grabbing") panel.style.cursor = "grab";

    applySizePreset(panel);

    const r = scanDeltaMatches();
    if (!r.ok) {
      const tableSection = panel.querySelector("[data-role='tableSection']");
      const showTable = (tableSection?.style.display !== "none");
      if (showTable) {
        renderTables(panel, [], []);
        updateHeaderTexts(panel, [], []);
      } else {
        updateHeaderTexts(panel, [], []);
      }
      return;
    }

    const tableSection = panel.querySelector("[data-role='tableSection']");
    const showTable = (tableSection?.style.display !== "none");

    if (showTable) renderTables(panel, r.calls, r.puts);
    updateHeaderTexts(panel, r.calls, r.puts);
  }

  // ---------------- Google Sheet push ----------------
  let pushTimer = null;
  let windowWatcher = null;
  let lastWindowActive = null;
  let pushInFlight = false;

  function getGSSettings() {
    const intervalNum = getNumKey(KEY_GS_INT_NUM, UI.defaults.intervalNum);
    const intervalUnit = getStrKey(KEY_GS_INT_UNIT, UI.defaults.intervalUnit);
    const startTime = getStrKey(KEY_GS_START_TIME, UI.defaults.startTime);
    const endTime = getStrKey(KEY_GS_END_TIME, UI.defaults.endTime);

    const unit = (intervalUnit === "sec" || intervalUnit === "min") ? intervalUnit : UI.defaults.intervalUnit;
    const num = clamp(Math.floor(Number(intervalNum)), 1, 20);
    const ms = computeIntervalMs(num, unit);

    return { num, unit, ms, startTime, endTime };
  }

  function collectPayload() {
    const r = scanDeltaMatches();
    if (!r.ok) return null;

    const hv = computeHeaderValues(r.calls, r.puts);

    const { a, b } = getRangeRaw();

    return {
      title: hv.title,
      underlying_key: hv.underlying.key,
      underlying_label: hv.underlying.label,
      lot: String(hv.underlying.lot),
      min: String(a),
      max: String(b),
      calls_total: Number.isFinite(hv.callVal) ? hv.callVal.toFixed(2) : "",
      puts_total: Number.isFinite(hv.putVal) ? hv.putVal.toFixed(2) : "",
      calls_count: String(r.calls.length),
      puts_count: String(r.puts.length),
      calls_json: JSON.stringify(r.calls || []),
      puts_json: JSON.stringify(r.puts || []),
      client_time: new Date().toISOString()
    };
  }

  function pushToGoogleSheet(panel, payload) {
    return new Promise((resolve) => {
      if (!GS_WEBAPP_URL || GS_WEBAPP_URL.includes("PASTE_YOUR_WEB_APP_URL_HERE")) {
        resolve({ ok: false, error: "Web App URL not set" });
        return;
      }

      try {
        chrome.runtime.sendMessage(
          {
            type: "SB_DELTA_GS_PUSH",
            url: GS_WEBAPP_URL,
            params: payload
          },
          (resp) => {
            const err = chrome.runtime.lastError;
            if (err) {
              resolve({ ok: false, error: String(err.message || err) });
              return;
            }
            resolve(resp || { ok: false, error: "no response" });
          }
        );
      } catch (e) {
        resolve({ ok: false, error: String(e) });
      }
    });
  }

  async function pushOnce(reason) {
    const panel = ensurePanel();

    if (getBoolKey(KEY_GS_PAUSED, UI.defaults.paused)) return;

    if (pushInFlight) return;
    pushInFlight = true;

    const s = getGSSettings();
    const now = new Date();

    if (!isWithinWindow(now, s.startTime, s.endTime)) {
      pushInFlight = false;
      return;
    }

    const payload = collectPayload();
    if (!payload) {
      setLastPush(panel, `Last push: ${formatTimeLocal(now)} (no data)`, "warn");
      pushInFlight = false;
      return;
    }

    const resp = await pushToGoogleSheet(panel, payload);

    const timeStr = formatTimeLocal(new Date());
    if (resp && resp.ok) {
      showToast(panel, "Data pushed to Google Sheet");
      setLastPush(panel, `Last push: ${timeStr} OK`, "ok");
      setStatus(panel, `Status: Push OK (${reason || "interval"})`, "ok");
    } else {
      const err = resp?.error || resp?.text || "push failed";
      showToast(panel, `Push failed: ${String(err).slice(0, 60)}`);
      setLastPush(panel, `Last push: ${timeStr} FAIL`, "err");
      setStatus(panel, "Status: Push failed", "err");
    }

    pushInFlight = false;
  }

  function applyPushScheduler(forceImmediate) {
    const panel = ensurePanel();
    const s = getGSSettings();

    // Manual pause overrides everything
    if (getBoolKey(KEY_GS_PAUSED, UI.defaults.paused)) {
      if (pushTimer) { clearInterval(pushTimer); pushTimer = null; }
      if (windowWatcher) { clearInterval(windowWatcher); windowWatcher = null; }
      setStatus(panel, "Status: Push paused (manual)", "warn");
      return;
    }

    if (pushTimer) {
      clearInterval(pushTimer);
      pushTimer = null;
    }

    // Main interval timer
    pushTimer = setInterval(() => {
      const now = new Date();
      if (isWithinWindow(now, s.startTime, s.endTime)) pushOnce("interval");
    }, s.ms);

    // Window watcher to trigger immediately when window opens/closes
    if (windowWatcher) {
      clearInterval(windowWatcher);
      windowWatcher = null;
    }

    lastWindowActive = null;
    windowWatcher = setInterval(() => {
      const now = new Date();
      const active = isWithinWindow(now, getStrKey(KEY_GS_START_TIME, UI.defaults.startTime), getStrKey(KEY_GS_END_TIME, UI.defaults.endTime));

      if (lastWindowActive === null) {
        lastWindowActive = active;
      } else if (active && !lastWindowActive) {
        // window just opened
        setStatus(panel, "Status: Auto push started", "ok");
        pushOnce("window start");
        lastWindowActive = true;
      } else if (!active && lastWindowActive) {
        // window just closed
        setStatus(panel, "Status: Auto push paused (outside time window)", "warn");
        lastWindowActive = false;
      }
    }, 1000);

    setStatus(panel, `Status: Auto push every ${s.num} ${s.unit === "sec" ? "sec" : "min"} (Window ${s.startTime}-${s.endTime})`, "ok");

    if (forceImmediate) {
      const now = new Date();
      if (isWithinWindow(now, s.startTime, s.endTime)) {
        pushOnce("manual save");
      }
    }
  }

  // ---------------- Bootstrap ----------------
  function start() {
    const panel = ensurePanel();
    applySizePreset(panel);

    update();
    setInterval(update, UI.updateMs);

    // Ensure panel re-appears if removed
    const mo = new MutationObserver(() => {
      if (!document.getElementById(PANEL_ID)) ensurePanel();
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });

    // Start push scheduler
    applyPushScheduler(false);

    // Status on load
    const s = getGSSettings();
    const now = new Date();
    if (isWithinWindow(now, s.startTime, s.endTime)) {
      setStatus(panel, "Status: Auto push active", "ok");
    } else {
      setStatus(panel, "Status: Auto push paused (outside time window)", "warn");
    }
  }

  start();
})();
