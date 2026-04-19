/**
 * Summaries repository backed by sheet:
 * Summaries columns:
 * A kind: ticker|topic
 * B value
 * C bullets_json
 * D top_links_json
 * E itemsCount
 * F updatedAt
 */

function readSummaries() {
  var ss = openConfiguredSpreadsheet();
  var sheet = ensureSheet(ss, SHEET_NAMES.SUMMARIES);
  applyHeaderFormatting(sheet, SCHEMA_HEADERS[SHEET_NAMES.SUMMARIES]);

  var rows = getDataRows(sheet, 6);
  return rows
    .map(toSummaryRow)
    .filter(function (row) {
      return row.kind && row.value;
    });
}

function getSummariesTodayResponse() {
  var ss = openConfiguredSpreadsheet();
  var tickersSheet = ensureSheet(ss, SHEET_NAMES.TICKERS);
  var topicsSheet = ensureSheet(ss, SHEET_NAMES.TOPICS);

  var allowedTickerSet = toSet(readTickerValues(tickersSheet).map(function (v) { return safeTrim(v).toUpperCase(); }));
  var allowedTopicSet = toSet(readTopicValues(topicsSheet).map(function (v) { return safeTrim(v); }));

  var rows = readSummaries();
  var tickers = [];
  var topics = [];

  rows.forEach(function (row) {
    if (row.kind === 'ticker') {
      if (!allowedTickerSet[row.value.toUpperCase()]) return;
      tickers.push(toSummaryGroup(row));
      return;
    }

    if (row.kind === 'topic') {
      if (!allowedTopicSet[row.value]) return;
      topics.push(toSummaryGroup(row));
    }
  });

  tickers.sort(function (a, b) { return a.value.localeCompare(b.value); });
  topics.sort(function (a, b) { return a.value.localeCompare(b.value); });

  return {
    date: todayDateInTimezone('Asia/Almaty'),
    tickers: tickers,
    topics: topics,
  };
}

function toSummaryRow(row) {
  var kind = safeTrim(row[0]).toLowerCase();
  var value = safeTrim(row[1]);

  return {
    kind: (kind === 'ticker' || kind === 'topic') ? kind : '',
    value: value,
    bullets: safeParseStringArray(row[2]),
    topLinks: safeParseTopLinks(row[3]),
    itemsCount: safeParseInt(row[4]),
    updatedAt: safeTrim(row[5]),
  };
}

function toSummaryGroup(row) {
  return {
    value: row.value,
    bullets: row.bullets,
    topLinks: row.topLinks,
    itemsCount: row.itemsCount,
  };
}

function safeParseStringArray(raw) {
  if (isBlank(raw)) return [];
  try {
    var parsed = JSON.parse(String(raw));
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(function (v) { return safeTrim(v); })
      .filter(function (v) { return v !== ''; });
  } catch (_err) {
    return [];
  }
}

function safeParseTopLinks(raw) {
  if (isBlank(raw)) return [];
  try {
    var parsed = JSON.parse(String(raw));
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map(function (item) {
        var obj = item && typeof item === 'object' ? item : {};
        return {
          title: safeTrim(obj.title),
          url: safeTrim(obj.url),
          source: safeTrim(obj.source),
          publishedAt: safeTrim(obj.publishedAt),
        };
      })
      .filter(function (item) {
        return item.title !== '' && item.url !== '';
      });
  } catch (_err) {
    return [];
  }
}

function safeParseInt(raw) {
  var n = Number(raw);
  if (!isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

function toSet(values) {
  var out = {};
  (values || []).forEach(function (v) {
    var key = safeTrim(v);
    if (!key) return;
    out[key] = true;
  });
  return out;
}

function seedExampleSummaries() {
  var ss = openConfiguredSpreadsheet();
  var sheet = ensureSheet(ss, SHEET_NAMES.SUMMARIES);
  applyHeaderFormatting(sheet, SCHEMA_HEADERS[SHEET_NAMES.SUMMARIES]);

  if (!isSheetDataEmpty(sheet)) {
    Logger.log('seedExampleSummaries(): Summaries already has data, skipping.');
    return;
  }

  var nowIso = new Date().toISOString();
  var rows = [
    [
      'ticker',
      'NVDA',
      JSON.stringify(['Спрос на AI-чипы остаётся высоким.']),
      JSON.stringify([{ title: 'NVIDIA AI update', url: 'https://example.com/nvda', source: 'Example', publishedAt: nowIso }]),
      3,
      nowIso,
    ],
    [
      'topic',
      'Искусственный интеллект',
      JSON.stringify(['Компании ускоряют внедрение ИИ в продукты.']),
      JSON.stringify([{ title: 'AI market overview', url: 'https://example.com/ai', source: 'Example', publishedAt: nowIso }]),
      5,
      nowIso,
    ],
  ];

  sheet.getRange(2, 1, rows.length, 6).setValues(rows);
  Logger.log('seedExampleSummaries(): inserted %s rows', rows.length);
}


function writeSummariesOverwrite(summaryRows, updatedAtIso) {
  var ss = openConfiguredSpreadsheet();
  var sheet = ensureSheet(ss, SHEET_NAMES.SUMMARIES);
  applyHeaderFormatting(sheet, SCHEMA_HEADERS[SHEET_NAMES.SUMMARIES]);

  clearDataRows(sheet);

  if (!summaryRows || !summaryRows.length) return;

  var tickers = summaryRows
    .filter(function (r) { return r.kind === 'ticker'; })
    .sort(function (a, b) { return a.value.localeCompare(b.value); });
  var topics = summaryRows
    .filter(function (r) { return r.kind === 'topic'; })
    .sort(function (a, b) { return a.value.localeCompare(b.value); });

  var ordered = tickers.concat(topics);
  var rows = ordered.map(function (r) {
    return [
      r.kind,
      r.value,
      JSON.stringify(r.bullets || []),
      JSON.stringify(r.topLinks || []),
      Number(r.itemsCount || 0),
      updatedAtIso,
    ];
  });

  sheet.getRange(2, 1, rows.length, 6).setValues(rows);
}
