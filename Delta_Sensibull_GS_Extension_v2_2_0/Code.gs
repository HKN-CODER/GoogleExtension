/**
 * Sensibull Delta Range Receiver (Google Apps Script Web App) - OVERWRITE MODE
 *
 * Receives x-www-form-urlencoded params from the Chrome extension and writes:
 * - Fixed header cells (overwrite)
 * - Strike rows (overwrite) starting at row 7 on every push (NO append)
 *
 * Sheet layout (as requested):
 * A1: Title (e.g., "Nifty Delta Range")
 * A2: CALLS, B2: calls_total (overwrite)
 * A3: PUTS,  B3: puts_total  (overwrite)
 * A5: CALLS <n> (overwrite)
 * A6:C6 headings for calls
 * E5: PUTS <n> (overwrite)
 * F6:H6 headings for puts
 * Row 7+: overwrite strikes in A-C (calls) and F-H (puts)
 */

// Change if you want to target a specific tab name.
const SHEET_NAME = "Sheet1";

function doGet() {
  return ContentService.createTextOutput("Sensibull Delta Range receiver (overwrite) is running");
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.tryLock(10000);

  try {
    const p = (e && e.parameter) ? e.parameter : {};

    const title = (p.title && String(p.title).trim()) ? String(p.title).trim() : "Nifty Delta Range";
    const callsTotal = toNumberOrBlank(p.calls_total);
    const putsTotal  = toNumberOrBlank(p.puts_total);

    const callsCount = toIntOrZero(p.calls_count);
    const putsCount  = toIntOrZero(p.puts_count);

    // Arrays arrive as JSON strings
    const callsArr = safeJsonArray(p.calls_json);
    const putsArr  = safeJsonArray(p.puts_json);

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = SHEET_NAME ? ss.getSheetByName(SHEET_NAME) : ss.getActiveSheet();
    if (!sheet) {
      return jsonOut({ ok: false, error: "Sheet not found: " + SHEET_NAME });
    }

    // ----- Fixed cells (overwrite) -----
    sheet.getRange(1, 1).setValue(title);      // A1

    sheet.getRange(2, 1).setValue("CALLS");    // A2
    sheet.getRange(3, 1).setValue("PUTS");     // A3

    sheet.getRange(2, 2).setValue(callsTotal); // B2
    sheet.getRange(3, 2).setValue(putsTotal);  // B3

    sheet.getRange(5, 1).setValue("CALLS " + callsCount); // A5
    sheet.getRange(5, 5).setValue("PUTS " + putsCount);   // E5

    // Headings
    sheet.getRange(6, 1).setValue("STRIKE"); // A6
    sheet.getRange(6, 2).setValue("LTP");    // B6
    sheet.getRange(6, 3).setValue("DELTA");  // C6

    sheet.getRange(6, 6).setValue("STRIKE"); // F6
    sheet.getRange(6, 7).setValue("LTP");    // G6
    sheet.getRange(6, 8).setValue("DELTA");  // H6

    // ----- Strike rows (overwrite, starting row 7) -----
    const startRow = 7;
    const lastRow = sheet.getLastRow();

    // Clear existing blocks in A-C and F-H from row 7 downward
    if (lastRow >= startRow) {
      const nRows = lastRow - startRow + 1;
      sheet.getRange(startRow, 1, nRows, 3).clearContent(); // A-C
      sheet.getRange(startRow, 6, nRows, 3).clearContent(); // F-H
    }

    const rows = Math.max(callsArr.length, putsArr.length);

    if (rows > 0) {
      const callsOut = [];
      const putsOut  = [];

      for (let i = 0; i < rows; i++) {
        const c = callsArr[i];
        const pRow = putsArr[i];

        if (c) {
          callsOut.push([toIntOrBlank(c.strike), toNumberOrBlank(c.ltp), toNumberOrBlank(c.delta)]);
        } else {
          callsOut.push(["", "", ""]);
        }

        if (pRow) {
          putsOut.push([toIntOrBlank(pRow.strike), toNumberOrBlank(pRow.ltp), toNumberOrBlank(pRow.delta)]);
        } else {
          putsOut.push(["", "", ""]);
        }
      }

      sheet.getRange(startRow, 1, rows, 3).setValues(callsOut); // A-C
      sheet.getRange(startRow, 6, rows, 3).setValues(putsOut);  // F-H
    }

    SpreadsheetApp.flush();

    return jsonOut({
      ok: true,
      mode: "overwrite",
      rowsWritten: rows,
      startRow: startRow,
      callsCount: callsCount,
      putsCount: putsCount
    });

  } catch (err) {
    return jsonOut({ ok: false, error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

// ---------------- Helpers ----------------

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function safeJsonArray(raw) {
  try {
    const v = JSON.parse(raw || "[]");
    return Array.isArray(v) ? v : [];
  } catch (e) {
    return [];
  }
}

function toNumberOrBlank(v) {
  const n = Number(String(v || "").replace(/,/g, "").trim());
  return isFinite(n) ? n : "";
}

function toIntOrZero(v) {
  const n = parseInt(String(v || "0").trim(), 10);
  return isFinite(n) ? n : 0;
}

function toIntOrBlank(v) {
  const n = parseInt(String(v || "").trim(), 10);
  return isFinite(n) ? n : "";
}
