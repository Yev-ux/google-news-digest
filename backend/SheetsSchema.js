/**
 * Spreadsheet schema bootstrap for Yevs News backend.
 */

const SCHEMA_HEADERS = Object.freeze({
  [SHEET_NAMES.TICKERS]: ['ticker', 'company', 'keywords'],
  [SHEET_NAMES.TOPICS]: ['topic', 'keywords'],
  [SHEET_NAMES.SOURCES]: ['name', 'type', 'value', 'extra'],
  [SHEET_NAMES.SUMMARIES]: ['kind', 'value', 'bullets_json', 'top_links_json', 'itemsCount', 'updatedAt'],
});

const DEFAULT_SOURCES = Object.freeze([
  ['Google News RSS RU', 'rss', 'https://news.google.com/rss?hl=ru&gl=KZ&ceid=KZ:ru', ''],
  ['Google News RSS EN', 'rss', 'https://news.google.com/rss?hl=en&gl=US&ceid=US:en', ''],
  ['GDELT_DOC', 'toggle', 'on', ''],
  ['KZ_DOMAINS', 'list', '', 'inform.kz,kz.kursiv.media,tengrinews.kz,zakon.kz,kapital.kz'],
]);

function openConfiguredSpreadsheet() {
  const spreadsheetId = getSpreadsheetId();
  try {
    return SpreadsheetApp.openById(spreadsheetId);
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    throw new Error(
      'Cannot open spreadsheet by SPREADSHEET_ID="' + spreadsheetId + '". ' +
      'Check that: (1) Script Property SPREADSHEET_ID contains spreadsheet ID (not random text), ' +
      '(2) this Apps Script project is authorized, and (3) your account has access to the spreadsheet. ' +
      'Original error: ' + msg
    );
  }
}

/**
 * Quick diagnostic helper for first-run setup problems.
 */
function debugConfig() {
  const props = getScriptProps().getProperties();
  const rawId = safeTrim(props[PROP_KEYS.SPREADSHEET_ID]);
  const normId = normalizeSpreadsheetId(rawId);
  const token = safeTrim(props[PROP_KEYS.AUTH_TOKEN]);

  Logger.log('SPREADSHEET_ID(raw)=%s', rawId || '<EMPTY>');
  Logger.log('SPREADSHEET_ID(normalized)=%s', normId || '<EMPTY>');
  Logger.log('AUTH_TOKEN set=%s', token ? 'yes' : 'no');

  if (!normId) {
    throw new Error('SPREADSHEET_ID is missing/invalid. Set it in Script Properties.');
  }

  const ss = SpreadsheetApp.openById(normId);
  Logger.log('Spreadsheet open OK. id=%s name=%s', ss.getId(), ss.getName());
}

/**
 * Creates/updates required sheets and headers.
 * Fills Sources defaults only when sheet has no data rows.
 * Idempotent: repeated runs do not duplicate data.
 */
function setupSpreadsheet() {
  const ss = openConfiguredSpreadsheet();

  const tickersSheet = ensureSheet(ss, SHEET_NAMES.TICKERS);
  const topicsSheet = ensureSheet(ss, SHEET_NAMES.TOPICS);
  const sourcesSheet = ensureSheet(ss, SHEET_NAMES.SOURCES);
  const summariesSheet = ensureSheet(ss, SHEET_NAMES.SUMMARIES);

  applyHeaderFormatting(tickersSheet, SCHEMA_HEADERS[SHEET_NAMES.TICKERS]);
  applyHeaderFormatting(topicsSheet, SCHEMA_HEADERS[SHEET_NAMES.TOPICS]);
  applyHeaderFormatting(sourcesSheet, SCHEMA_HEADERS[SHEET_NAMES.SOURCES]);
  applyHeaderFormatting(summariesSheet, SCHEMA_HEADERS[SHEET_NAMES.SUMMARIES]);

  appendRowsIfEmpty(sourcesSheet, DEFAULT_SOURCES);

  Logger.log('setupSpreadsheet() complete for spreadsheet: %s', ss.getId());
}

/**
 * Seeds sample preferences only if target sheets have no data.
 */
function seedExamplePreferences() {
  const ss = openConfiguredSpreadsheet();
  const tickersSheet = ensureSheet(ss, SHEET_NAMES.TICKERS);
  const topicsSheet = ensureSheet(ss, SHEET_NAMES.TOPICS);

  applyHeaderFormatting(tickersSheet, SCHEMA_HEADERS[SHEET_NAMES.TICKERS]);
  applyHeaderFormatting(topicsSheet, SCHEMA_HEADERS[SHEET_NAMES.TOPICS]);

  appendRowsIfEmpty(tickersSheet, [
    ['NVDA', 'NVIDIA Corporation', 'nvidia, ai chips, datacenter'],
    ['AAPL', 'Apple Inc.', 'apple, iphone, services'],
    ['TSLA', 'Tesla, Inc.', 'tesla, ev, autonomy'],
  ]);

  appendRowsIfEmpty(topicsSheet, [
    ['Искусственный интеллект', 'генеративный ии, llm, ai'],
    ['Казахстан экономика', 'инфляция, тенге, нацбанк'],
    ['Big Tech', 'google, microsoft, amazon, meta'],
  ]);

  Logger.log('seedExamplePreferences() complete for spreadsheet: %s', ss.getId());
}

/**
 * Logs the current schema status: sheets + current header row.
 */
function debugPrintSchema() {
  const ss = openConfiguredSpreadsheet();
  const required = [
    SHEET_NAMES.TICKERS,
    SHEET_NAMES.TOPICS,
    SHEET_NAMES.SOURCES,
    SHEET_NAMES.SUMMARIES,
  ];

  required.forEach((name) => {
    const sheet = ss.getSheetByName(name);
    if (!sheet) {
      Logger.log('[MISSING] %s', name);
      return;
    }

    const width = Math.max(sheet.getLastColumn(), SCHEMA_HEADERS[name].length);
    const headers = sheet.getRange(1, 1, 1, width).getDisplayValues()[0]
      .map((v) => safeTrim(v))
      .filter((v) => v !== '');

    Logger.log('[OK] %s | headers=%s | rows=%s', name, JSON.stringify(headers), sheet.getLastRow());
  });
}
