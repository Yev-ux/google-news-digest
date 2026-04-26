/**
 * Spreadsheet schema bootstrap for Yevs News backend.
 */

function getSheetNames() {
  if (typeof SHEET_NAMES !== 'undefined' && SHEET_NAMES) {
    return SHEET_NAMES;
  }
  throw new Error(
    'SHEET_NAMES is not defined. Ensure Utils.gs is included in this Apps Script project and has no syntax errors.'
  );
}

const SCHEMA_HEADERS = Object.freeze({
  Tickers: ['ticker', 'company', 'keywords'],
  Topics: ['topic', 'keywords'],
  Sources: ['name', 'type', 'value', 'extra'],
  Summaries: ['kind', 'value', 'bullets_json', 'top_links_json', 'itemsCount', 'updatedAt'],
});

function getSchemaHeaders() {
  return SCHEMA_HEADERS;
}

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
  var names = getSheetNames();
  var headers = getSchemaHeaders();
  const ss = openConfiguredSpreadsheet();

  const tickersSheet = ensureSheet(ss, names.TICKERS);
  const topicsSheet = ensureSheet(ss, names.TOPICS);
  const sourcesSheet = ensureSheet(ss, names.SOURCES);
  const summariesSheet = ensureSheet(ss, names.SUMMARIES);

  applyHeaderFormatting(tickersSheet, headers[names.TICKERS]);
  applyHeaderFormatting(topicsSheet, headers[names.TOPICS]);
  applyHeaderFormatting(sourcesSheet, headers[names.SOURCES]);
  applyHeaderFormatting(summariesSheet, headers[names.SUMMARIES]);

  appendRowsIfEmpty(sourcesSheet, DEFAULT_SOURCES);

  Logger.log('setupSpreadsheet() complete for spreadsheet: %s', ss.getId());
}

/**
 * Seeds sample preferences only if target sheets have no data.
 */
function seedExamplePreferences() {
  var names = getSheetNames();
  var headers = getSchemaHeaders();
  const ss = openConfiguredSpreadsheet();
  const tickersSheet = ensureSheet(ss, names.TICKERS);
  const topicsSheet = ensureSheet(ss, names.TOPICS);

  applyHeaderFormatting(tickersSheet, headers[names.TICKERS]);
  applyHeaderFormatting(topicsSheet, headers[names.TOPICS]);

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
  var names = getSheetNames();
  var headers = getSchemaHeaders();
  const ss = openConfiguredSpreadsheet();
  const required = [
    names.TICKERS,
    names.TOPICS,
    names.SOURCES,
    names.SUMMARIES,
  ];

  required.forEach((name) => {
    const sheet = ss.getSheetByName(name);
    if (!sheet) {
      Logger.log('[MISSING] %s', name);
      return;
    }

    const width = Math.max(sheet.getLastColumn(), headers[name].length);
    const rowHeaders = sheet.getRange(1, 1, 1, width).getDisplayValues()[0]
      .map((v) => safeTrim(v))
      .filter((v) => v !== '');

    Logger.log('[OK] %s | headers=%s | rows=%s', name, JSON.stringify(rowHeaders), sheet.getLastRow());
  });
}