/**
 * Preferences repository backed by sheets:
 * - Tickers: A=ticker, B=company, C=keywords
 * - Topics:  A=topic,  B=keywords
 */

function getPreferencesFromSheets() {
  const ss = openConfiguredSpreadsheet();
  const tickersSheet = ensureSheet(ss, SHEET_NAMES.TICKERS);
  const topicsSheet = ensureSheet(ss, SHEET_NAMES.TOPICS);

  const tickers = readTickerValues(tickersSheet);
  const topics = readTopicValues(topicsSheet);

  return {
    userId: 'yev',
    tickers: tickers,
    topics: topics,
    updatedAt: new Date().toISOString(),
  };
}

function savePreferencesToSheets(inputTickers, inputTopics) {
  const ss = openConfiguredSpreadsheet();
  const tickersSheet = ensureSheet(ss, SHEET_NAMES.TICKERS);
  const topicsSheet = ensureSheet(ss, SHEET_NAMES.TOPICS);

  applyHeaderFormatting(tickersSheet, SCHEMA_HEADERS[SHEET_NAMES.TICKERS]);
  applyHeaderFormatting(topicsSheet, SCHEMA_HEADERS[SHEET_NAMES.TOPICS]);

  const tickers = normalizeTickers(inputTickers).sort();
  const topics = normalizeTopics(inputTopics).sort((a, b) => a.localeCompare(b));

  rewriteTickersPreservingMeta(tickersSheet, tickers);
  rewriteTopicsPreservingMeta(topicsSheet, topics);

  return {
    ok: true,
    tickers: tickers,
    topics: topics,
  };
}

function readTickerValues(sheet) {
  const rows = getDataRows(sheet, 3);
  return uniq(rows.map((r) => safeTrim(r[0]).toUpperCase()).filter((v) => v !== ''));
}

function readTopicValues(sheet) {
  const rows = getDataRows(sheet, 2);
  return uniq(rows.map((r) => safeTrim(r[0])).filter((v) => v !== ''));
}

function normalizeTickers(values) {
  const list = Array.isArray(values) ? values : [];
  return uniq(list.map((v) => safeTrim(v).toUpperCase()).filter((v) => v !== ''));
}

function normalizeTopics(values) {
  const list = Array.isArray(values) ? values : [];
  return uniq(list.map((v) => safeTrim(v)).filter((v) => v !== ''));
}

function getDataRows(sheet, width) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, 1, lastRow - 1, width).getValues();
}

function clearDataRows(sheet) {
  const maxRows = sheet.getMaxRows();
  if (maxRows > 1) {
    sheet.getRange(2, 1, maxRows - 1, sheet.getMaxColumns()).clearContent();
  }
}

function rewriteTickersPreservingMeta(sheet, tickers) {
  const oldRows = getDataRows(sheet, 3);
  const byTicker = {};
  oldRows.forEach((row) => {
    const ticker = safeTrim(row[0]).toUpperCase();
    if (!ticker) return;
    if (byTicker[ticker]) return;
    byTicker[ticker] = {
      company: safeTrim(row[1]),
      keywords: safeTrim(row[2]),
    };
  });

  clearDataRows(sheet);

  if (!tickers.length) return;

  const rows = tickers.map((ticker) => {
    const meta = byTicker[ticker] || { company: '', keywords: '' };
    return [ticker, meta.company, meta.keywords];
  });

  sheet.getRange(2, 1, rows.length, 3).setValues(rows);
}

function rewriteTopicsPreservingMeta(sheet, topics) {
  const oldRows = getDataRows(sheet, 2);
  const byTopic = {};
  oldRows.forEach((row) => {
    const topic = safeTrim(row[0]);
    if (!topic) return;
    if (byTopic[topic]) return;
    byTopic[topic] = {
      keywords: safeTrim(row[1]),
    };
  });

  clearDataRows(sheet);

  if (!topics.length) return;

  const rows = topics.map((topic) => {
    const meta = byTopic[topic] || { keywords: '' };
    return [topic, meta.keywords];
  });

  sheet.getRange(2, 1, rows.length, 2).setValues(rows);
}
