/**
 * Stage 4: collect-only run (RSS + GDELT) for last 24h.
 * No OpenAI calls and no writes to Summaries sheet.
 */

var RUN_CONFIG = Object.freeze({
  WINDOW_HOURS: 24,
  MAX_ITEMS_PER_GROUP: 12,
  MAX_SAMPLE_ITEMS: 3,
  RSS_HTTP_TIMEOUT_MS: 15000,
  GDELT_HTTP_TIMEOUT_MS: 15000,
  FETCH_RETRY_COUNT: 1,
  MAX_GDELT_GROUPS: 50,
});

function runCollectOnly(options) {
  options = options || {};
  var collected = collectAllGroupsNews(RUN_CONFIG.WINDOW_HOURS, options);

  var perGroup = collected.groups.map(function (g) {
    return {
      kind: g.kind,
      value: g.value,
      queryUsed: g.queryUsed,
      itemsBeforeDedup: g.itemsBeforeDedup,
      itemsAfterDedup: g.itemsAfterDedup,
      topSample: (g.items || []).slice(0, RUN_CONFIG.MAX_SAMPLE_ITEMS).map(toSampleItem),
    };
  });

  var response = {
    ok: true,
    date: todayDateInTimezone('Asia/Almaty'),
    ranAt: collected.ranAt,
    windowHours: collected.windowHours,
    groupsTotal: collected.groups.length,
    totals: collected.totals,
    sourceFlags: {
      gdeltOn: collected.sourceConfig.gdeltOn,
      kzDomains: collected.sourceConfig.kzDomains,
    },
    limits: {
      maxItemsPerGroup: RUN_CONFIG.MAX_ITEMS_PER_GROUP,
      maxGdeltGroups: RUN_CONFIG.MAX_GDELT_GROUPS,
    },
    perGroup: perGroup,
    errors: collected.errors,
  };

  Logger.log('runCollectOnly done: %s', JSON.stringify({
    groupsTotal: response.groupsTotal,
    totals: response.totals,
    errors: collected.errors.length,
  }));

  return response;
}

function collectAllGroupsNews(windowHours, options) {
  options = options || {};
  var now = new Date();
  var hours = Number(windowHours || RUN_CONFIG.WINDOW_HOURS);
  var windowStartMs = now.getTime() - hours * 60 * 60 * 1000;

  var sourceConfig = readSourcesConfig();
  var groups = buildGroupsFromPreferences();
  var targetKind = safeTrim(options.kind).toLowerCase();
  var targetValue = safeTrim(options.value).toLowerCase();
  if (targetKind || targetValue) {
    groups = groups.filter(function (g) {
      var kindOk = !targetKind || safeTrim(g.kind).toLowerCase() === targetKind;
      var valueOk = !targetValue || safeTrim(g.value).toLowerCase() === targetValue;
      return kindOk && valueOk;
    });
  }

  var totalsBefore = 0;
  var totalsAfter = 0;
  var errors = [];
  var collectedGroups = [];

  var gdeltEnabled = sourceConfig.gdeltOn;
  var gdeltProcessed = 0;

  groups.forEach(function (group) {
    var queryUsed = buildGroupQuery(group);
    var rssItems = [];
    var gdeltItems = [];

    if (!queryUsed) {
      collectedGroups.push({
        kind: group.kind,
        value: group.value,
        queryUsed: '',
        itemsBeforeDedup: 0,
        itemsAfterDedup: 0,
        itemsCount: 0,
        items: [],
      });
      return;
    }

    try {
      rssItems = collectRssForGroup(queryUsed, sourceConfig, windowStartMs);
    } catch (err) {
      errors.push({
        kind: group.kind,
        value: group.value,
        stage: 'rss',
        message: String(err && err.message ? err.message : err),
      });
    }

    if (gdeltEnabled) {
      if (gdeltProcessed < RUN_CONFIG.MAX_GDELT_GROUPS) {
        try {
          gdeltItems = collectGdeltForGroup(queryUsed, windowStartMs);
        } catch (err) {
          errors.push({
            kind: group.kind,
            value: group.value,
            stage: 'gdelt',
            message: String(err && err.message ? err.message : err),
          });
        }
        gdeltProcessed += 1;
      } else {
        errors.push({
          kind: group.kind,
          value: group.value,
          stage: 'gdelt',
          message: 'Skipped due to MAX_GDELT_GROUPS limit',
        });
      }
    }

    var beforeDedup = rssItems.length + gdeltItems.length;
    totalsBefore += beforeDedup;

    var deduped = deduplicateAndLimit(rssItems.concat(gdeltItems), RUN_CONFIG.MAX_ITEMS_PER_GROUP);
    totalsAfter += deduped.length;

    collectedGroups.push({
      kind: group.kind,
      value: group.value,
      queryUsed: queryUsed,
      itemsBeforeDedup: beforeDedup,
      itemsAfterDedup: deduped.length,
      itemsCount: deduped.length,
      items: deduped,
    });
  });

  return {
    ranAt: now.toISOString(),
    windowHours: hours,
    sourceConfig: sourceConfig,
    groups: collectedGroups,
    totals: {
      itemsBeforeDedup: totalsBefore,
      itemsAfterDedup: totalsAfter,
    },
    errors: errors,
  };
}

function buildGroupsFromPreferences() {
  var ss = openConfiguredSpreadsheet();
  var tickersSheet = ensureSheet(ss, SHEET_NAMES.TICKERS);
  var topicsSheet = ensureSheet(ss, SHEET_NAMES.TOPICS);

  var tickerRows = getDataRows(tickersSheet, 3);
  var topicRows = getDataRows(topicsSheet, 2);

  var groups = [];

  tickerRows.forEach(function (row) {
    var ticker = safeTrim(row[0]).toUpperCase();
    if (!ticker) return;
    groups.push({
      kind: 'ticker',
      value: ticker,
      company: safeTrim(row[1]),
      keywords: safeTrim(row[2]),
    });
  });

  topicRows.forEach(function (row) {
    var topic = safeTrim(row[0]);
    if (!topic) return;
    groups.push({
      kind: 'topic',
      value: topic,
      keywords: safeTrim(row[1]),
    });
  });

  return groups;
}

function readSourcesConfig() {
  var ss = openConfiguredSpreadsheet();
  var sourcesSheet = ensureSheet(ss, SHEET_NAMES.SOURCES);
  var rows = getDataRows(sourcesSheet, 4);

  var gdeltOn = true;
  var kzDomains = [
    'inform.kz',
    'kz.kursiv.media',
    'tengrinews.kz',
    'zakon.kz',
    'kapital.kz',
  ];

  rows.forEach(function (row) {
    var name = safeTrim(row[0]).toLowerCase();
    var value = safeTrim(row[2]).toLowerCase();
    var extra = safeTrim(row[3]);

    if (name === 'gdelt_doc') {
      gdeltOn = (value === 'on');
    }

    if (name === 'kz_domains' && extra) {
      kzDomains = uniq(extra.split(',').map(function (d) { return safeTrim(d).toLowerCase(); }));
    }
  });

  return {
    gdeltOn: gdeltOn,
    kzDomains: kzDomains,
  };
}

function buildGroupQuery(group) {
  if (group.kind === 'ticker') {
    var tickerTerms = splitKeywords(group.keywords);
    if (tickerTerms.length) return joinOrTerms(tickerTerms.concat([group.value]));
    if (group.company) return joinOrTerms([group.company, group.value]);
    return group.value;
  }

  if (group.kind === 'topic') {
    var topicTerms = splitKeywords(group.keywords);
    return joinOrTerms(topicTerms.concat([group.value]));
  }

  return '';
}

function splitKeywords(text) {
  if (!text) return [];
  return uniq(text.split(/[;,\n]/).map(function (v) { return safeTrim(v); }).filter(function (v) { return v !== ''; }));
}

function joinOrTerms(terms) {
  var clean = uniq((terms || []).map(function (v) { return safeTrim(v); }).filter(function (v) { return v !== ''; }));
  if (!clean.length) return '';
  if (clean.length === 1) return clean[0];
  return clean.map(function (t) { return '(' + t + ')'; }).join(' OR ');
}

function collectRssForGroup(queryUsed, sourceConfig, windowStartMs) {
  var rssUrls = buildGoogleNewsUrls(queryUsed, sourceConfig.kzDomains);
  var items = [];

  rssUrls.forEach(function (url) {
    var xmlText = fetchTextWithRetry(url, RUN_CONFIG.RSS_HTTP_TIMEOUT_MS, RUN_CONFIG.FETCH_RETRY_COUNT);
    if (!xmlText) return;
    var parsed = parseRssItems(xmlText);
    items = items.concat(parsed);
  });

  return items.filter(function (item) {
    var t = Date.parse(item.publishedAt);
    return isFinite(t) && t >= windowStartMs;
  });
}

function buildGoogleNewsUrls(queryUsed, kzDomains) {
  var baseRu = 'https://news.google.com/rss/search?hl=ru&gl=KZ&ceid=KZ:ru&q=';
  var baseEn = 'https://news.google.com/rss/search?hl=en&gl=US&ceid=US:en&q=';

  var normalQ = encodeURIComponent(queryUsed);
  var urls = [baseRu + normalQ, baseEn + normalQ];

  if (kzDomains && kzDomains.length) {
    var siteClause = kzDomains.map(function (d) { return 'site:' + d; }).join(' OR ');
    var boosted = '(' + queryUsed + ') (' + siteClause + ')';
    var boostedQ = encodeURIComponent(boosted);
    urls.push(baseRu + boostedQ);
    urls.push(baseEn + boostedQ);
  }

  return urls;
}

function parseRssItems(xmlText) {
  var doc = XmlService.parse(xmlText);
  var root = doc.getRootElement();

  var channel = root.getChild('channel');
  if (!channel) return [];

  var items = channel.getChildren('item');
  return items
    .map(function (itemEl) {
      var title = safeTrim(textOf(itemEl, 'title'));
      var url = safeTrim(textOf(itemEl, 'link'));
      var pubDateRaw = safeTrim(textOf(itemEl, 'pubDate'));
      var source = safeTrim(textOf(itemEl, 'source'));
      var description = safeTrim(textOf(itemEl, 'description'));

      var publishedAt = toIso(pubDateRaw);
      if (!title || !url || !publishedAt) return null;

      return {
        title: title,
        url: normalizeUrl(url),
        source: source || hostFromUrl(url),
        publishedAt: publishedAt,
        description: description,
      };
    })
    .filter(function (x) { return !!x; });
}

function collectGdeltForGroup(queryUsed, windowStartMs) {
  var gdeltQuery = normalizeQueryForGdelt(queryUsed);
  var url = 'https://api.gdeltproject.org/api/v2/doc/doc?format=json&mode=ArtList&sort=DateDesc&maxrecords=30&timespan=1d&query=' + encodeURIComponent(gdeltQuery);
  var text = fetchTextWithRetry(url, RUN_CONFIG.GDELT_HTTP_TIMEOUT_MS, RUN_CONFIG.FETCH_RETRY_COUNT);
  if (!text) return [];

  var obj;
  try {
    obj = JSON.parse(text);
  } catch (_err) {
    throw new Error('GDELT non-JSON response for query: ' + gdeltQuery + ' | preview: ' + safeTrim(String(text)).slice(0, 120));
  }

  var articles = Array.isArray(obj.articles) ? obj.articles : [];

  return articles
    .map(function (a) {
      var title = safeTrim(a.title);
      var url = safeTrim(a.url);
      var publishedAt = toIso(a.seendate || a.date || a.publishedAt);
      if (!title || !url || !publishedAt) return null;

      return {
        title: title,
        url: normalizeUrl(url),
        source: safeTrim(a.domain) || safeTrim(a.sourceCountry) || hostFromUrl(url),
        publishedAt: publishedAt,
        description: safeTrim(a.snippet || a.socialimage || ''),
      };
    })
    .filter(function (x) {
      if (!x) return false;
      var t = Date.parse(x.publishedAt);
      return isFinite(t) && t >= windowStartMs;
    });
}


function normalizeQueryForGdelt(queryUsed) {
  var q = safeTrim(queryUsed);
  if (!q) return q;
  // GDELT parser is sensitive to verbose boolean expressions with many parentheses.
  q = q.replace(/[()]/g, ' ');
  q = q.replace(/\s+OR\s+/gi, ' ');
  q = q.replace(/\s+/g, ' ').trim();
  return q;
}

function fetchTextWithRetry(url, timeoutMs, retryCount) {
  var attempts = (retryCount || 0) + 1;
  var lastErr = null;

  for (var i = 0; i < attempts; i += 1) {
    try {
      var resp = UrlFetchApp.fetch(url, {
        muteHttpExceptions: true,
        followRedirects: true,
        validateHttpsCertificates: true,
      });
      var code = resp.getResponseCode();
      if (code >= 200 && code < 300) return resp.getContentText();
      if (code >= 500 && i < attempts - 1) continue;
      throw new Error('HTTP ' + code + ' for URL: ' + url);
    } catch (err) {
      lastErr = err;
      if (i >= attempts - 1) break;
      Utilities.sleep(250);
    }
  }

  throw lastErr || new Error('Unknown fetch error for URL: ' + url);
}

function deduplicateAndLimit(items, maxItems) {
  var sorted = (items || []).slice().sort(function (a, b) {
    return Date.parse(b.publishedAt) - Date.parse(a.publishedAt);
  });

  var byKey = {};
  var out = [];

  sorted.forEach(function (item) {
    if (out.length >= maxItems) return;

    var urlKey = normalizeUrl(item.url);
    var fallbackKey = (safeTrim(item.title).toLowerCase() + '|' + safeTrim(item.source).toLowerCase());
    var key = urlKey || fallbackKey;
    if (!key) return;
    if (byKey[key]) return;

    byKey[key] = true;
    out.push(item);
  });

  return out;
}

function toSampleItem(item) {
  return {
    title: item.title,
    url: item.url,
    source: item.source,
    publishedAt: item.publishedAt,
  };
}

function toIso(rawDate) {
  var s = safeTrim(rawDate);
  if (!s) return '';

  var parsed = Date.parse(s);
  if (isFinite(parsed)) return new Date(parsed).toISOString();

  // GDELT may return compact UTC datetime: yyyyMMddHHmmss
  if (/^\d{14}$/.test(s)) {
    var y = s.slice(0, 4);
    var m = s.slice(4, 6);
    var d = s.slice(6, 8);
    var hh = s.slice(8, 10);
    var mm = s.slice(10, 12);
    var ss = s.slice(12, 14);
    var isoLike = y + '-' + m + '-' + d + 'T' + hh + ':' + mm + ':' + ss + 'Z';
    var t = Date.parse(isoLike);
    if (isFinite(t)) return new Date(t).toISOString();
  }

  return '';
}

function textOf(el, name) {
  var child = el.getChild(name);
  return child ? child.getText() : '';
}

function normalizeUrl(url) {
  var s = safeTrim(url);
  if (!s) return '';
  return s.replace(/\/+$/, '');
}

function hostFromUrl(url) {
  try {
    var m = String(url).match(/^https?:\/\/([^\/]+)/i);
    return m && m[1] ? m[1].toLowerCase() : '';
  } catch (_err) {
    return '';
  }
}
