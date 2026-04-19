/**
 * Generic utility helpers for Apps Script (V8).
 */
const SHEET_NAMES = Object.freeze({
  TICKERS: 'Tickers',
  TOPICS: 'Topics',
  SOURCES: 'Sources',
  SUMMARIES: 'Summaries',
});

function safeTrim(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function isBlank(value) {
  return safeTrim(value) === '';
}

function uniq(values) {
  const out = [];
  const seen = new Set();
  (values || []).forEach((value) => {
    const normalized = safeTrim(value);
    if (!normalized) return;
    if (seen.has(normalized)) return;
    seen.add(normalized);
    out.push(normalized);
  });
  return out;
}

function ensureSheet(ss, name) {
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function isSheetDataEmpty(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return true;

  const lastColumn = Math.max(sheet.getLastColumn(), 1);
  const data = sheet.getRange(2, 1, lastRow - 1, lastColumn).getValues();
  return data.every((row) => row.every((cell) => isBlank(cell)));
}

function applyHeaderFormatting(sheet, headers) {
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);

  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange
    .setFontWeight('bold')
    .setBackground('#F3F4F6')
    .setHorizontalAlignment('left');

  sheet.autoResizeColumns(1, headers.length);
}

function appendRowsIfEmpty(sheet, rows) {
  if (!rows || rows.length === 0) return;
  if (!isSheetDataEmpty(sheet)) return;
  sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
}


function todayDateInTimezone(timezone) {
  return Utilities.formatDate(new Date(), timezone || Session.getScriptTimeZone(), 'yyyy-MM-dd');
}
