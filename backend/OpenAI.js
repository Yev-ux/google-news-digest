/**
 * OpenAI single-batch summarization for all groups.
 */

var OPENAI_CONFIG = Object.freeze({
  API_URL: 'https://api.openai.com/v1/responses',
  MAX_DESCRIPTION_CHARS: 280,
  MAX_BULLET_CHARS: 220,
  MAX_LINKS_PER_GROUP: 3,
  MAX_GROUPS_PER_OPENAI_CALL: 12,
});

function summarizeAllGroupsWithOpenAI(groups, dateStr) {
  var apiKey = getOpenAIApiKey();
  var model = getOpenAIModel();

  var requestGroups = groups.map(function (group) {
    return {
      kind: group.kind,
      value: group.value,
      items: (group.items || []).slice(0, RUN_CONFIG.MAX_ITEMS_PER_GROUP).map(function (item) {
        return {
          title: safeTrim(item.title),
          url: safeTrim(item.url),
          source: safeTrim(item.source),
          publishedAt: safeTrim(item.publishedAt),
          description: safeTrim(item.description).slice(0, OPENAI_CONFIG.MAX_DESCRIPTION_CHARS),
        };
      }),
    };
  });

  var allResults = [];
  var chunkSize = Math.max(1, Number(OPENAI_CONFIG.MAX_GROUPS_PER_OPENAI_CALL || 12));
  var chunks = chunkArray(requestGroups, chunkSize);

  chunks.forEach(function (chunk, idx) {
    var payload = buildOpenAIPayload(model, dateStr, chunk);
    var responseText = callOpenAIResponsesApi(apiKey, payload);
    var parsed = parseOpenAIJsonResponse(responseText);
    var results = Array.isArray(parsed.results) ? parsed.results : [];
    allResults = allResults.concat(results);
    Logger.log('OpenAI batch %s/%s: groups=%s results=%s', idx + 1, chunks.length, chunk.length, results.length);
  });

  return normalizeSummaryResults(groups, allResults);
}

function buildOpenAIPayload(model, dateStr, groups) {
  var schema = {
    name: 'news_digest_results',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        results: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              kind: { type: 'string', enum: ['ticker', 'topic'] },
              value: { type: 'string' },
              bullets: {
                type: 'array',
                items: { type: 'string' },
              },
              topLinks: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    title: { type: 'string' },
                    url: { type: 'string' },
                    source: { type: 'string' },
                    publishedAt: { type: 'string' },
                  },
                  required: ['title', 'url', 'source', 'publishedAt'],
                },
              },
              itemsCount: { type: 'integer' },
            },
            required: ['kind', 'value', 'bullets', 'topLinks', 'itemsCount'],
          },
        },
      },
      required: ['results'],
    },
  };

  var systemPrompt = [
    'Ты делаешь русскоязычные краткие новостные сводки по группам (ticker/topic).',
    'Только факты из переданных items. Никаких домыслов.',
    'Если itemsCount > 0: дай 3-5 буллетов.',
    'Если itemsCount == 0: bullets=["Нет значимых новостей за последние 24 часа."] и topLinks=[].',
    'TopLinks: до 3 ссылок из входных items.',
    'Язык: русский.',
  ].join(' ');

  var userPayload = {
    date: dateStr,
    groups: groups,
  };

  return {
    model: model,
    input: [
      { role: 'system', content: [{ type: 'input_text', text: systemPrompt }] },
      { role: 'user', content: [{ type: 'input_text', text: JSON.stringify(userPayload) }] },
    ],
    text: {
      format: {
        type: 'json_schema',
        name: schema.name,
        strict: true,
        schema: schema.schema,
      },
    },
  };
}

function callOpenAIResponsesApi(apiKey, payload) {
  var resp = UrlFetchApp.fetch(OPENAI_CONFIG.API_URL, {
    method: 'post',
    contentType: 'application/json',
    muteHttpExceptions: true,
    headers: {
      Authorization: 'Bearer ' + apiKey,
    },
    payload: JSON.stringify(payload),
  });

  var code = resp.getResponseCode();
  var text = resp.getContentText();
  if (code < 200 || code >= 300) {
    throw new Error('OpenAI HTTP ' + code + ': ' + safeTrim(text).slice(0, 500));
  }

  return text;
}

function parseOpenAIJsonResponse(rawText) {
  var obj = JSON.parse(rawText);

  if (obj.output_text && safeTrim(obj.output_text)) {
    return JSON.parse(obj.output_text);
  }

  if (Array.isArray(obj.output)) {
    for (var i = 0; i < obj.output.length; i += 1) {
      var chunk = obj.output[i];
      if (!chunk || !Array.isArray(chunk.content)) continue;
      for (var j = 0; j < chunk.content.length; j += 1) {
        var c = chunk.content[j];
        if (c && c.type === 'output_text' && safeTrim(c.text)) {
          return JSON.parse(c.text);
        }
      }
    }
  }

  throw new Error('OpenAI response has no parseable output_text');
}

function normalizeSummaryResults(inputGroups, modelResults) {
  var byKey = {};

  (modelResults || []).forEach(function (r) {
    var kind = safeTrim(r.kind);
    var value = safeTrim(r.value);
    if (!kind || !value) return;
    byKey[kind + '::' + value] = r;
  });

  return inputGroups.map(function (group) {
    var key = group.kind + '::' + group.value;
    var modelRow = byKey[key] || {};
    var itemUrlSet = toSet((group.items || []).map(function (i) { return normalizeUrl(i.url); }));

    var itemsCount = Number(group.itemsCount || (group.items || []).length || 0);
    var bullets = normalizeBullets(modelRow.bullets, itemsCount, group.items || []);
    bullets = ensureRussianBullets(bullets);
    var topLinks = normalizeTopLinks(modelRow.topLinks, itemUrlSet);

    if (itemsCount > 0 && topLinks.length === 0) {
      topLinks = fallbackTopLinksFromItems(group.items || []);
    }

    if (itemsCount === 0) {
      bullets = ['Нет значимых новостей за последние 24 часа.'];
      topLinks = [];
    }

    return {
      kind: group.kind,
      value: group.value,
      bullets: bullets,
      topLinks: topLinks,
      itemsCount: itemsCount,
    };
  });
}


function fallbackTopLinksFromItems(items) {
  var list = Array.isArray(items) ? items : [];
  var out = [];
  var seen = {};

  list.forEach(function (item) {
    if (out.length >= OPENAI_CONFIG.MAX_LINKS_PER_GROUP) return;

    var url = normalizeUrl(item && item.url);
    if (!url || seen[url]) return;
    seen[url] = true;

    out.push({
      title: safeTrim(item.title) || url,
      url: url,
      source: safeTrim(item.source),
      publishedAt: safeTrim(item.publishedAt),
    });
  });

  return out;
}

function normalizeBullets(rawBullets, itemsCount, items) {
  var arr = Array.isArray(rawBullets) ? rawBullets : [];
  var out = arr
    .map(function (b) { return safeTrim(b); })
    .filter(function (b) { return b !== ''; })
    .map(function (b) { return b.slice(0, OPENAI_CONFIG.MAX_BULLET_CHARS); });

  if (itemsCount > 0) {
    if (out.length === 0) {
      var fallback = fallbackBulletsFromItems(items || []);
      return fallback.length ? fallback : ['Не удалось сформировать сводку по найденным новостям.'];
    }
    if (out.length > 5) return out.slice(0, 5);
    return out;
  }

  return out.length ? [out[0]] : ['Нет значимых новостей за последние 24 часа.'];
}

function fallbackBulletsFromItems(items) {
  var list = Array.isArray(items) ? items : [];
  var out = [];

  list.slice(0, 3).forEach(function (item) {
    var title = safeTrim(item && item.title);
    if (!title) return;
    out.push(toRussianIfNeeded(('Ключевой материал: ' + title).slice(0, OPENAI_CONFIG.MAX_BULLET_CHARS)));
  });

  return out;
}

function chunkArray(arr, size) {
  var list = Array.isArray(arr) ? arr : [];
  var n = Math.max(1, Number(size || 1));
  var out = [];
  for (var i = 0; i < list.length; i += n) {
    out.push(list.slice(i, i + n));
  }
  return out;
}

function ensureRussianBullets(bullets) {
  var arr = Array.isArray(bullets) ? bullets : [];
  return arr.map(function (text) {
    return toRussianIfNeeded(text);
  });
}

function toRussianIfNeeded(text) {
  var s = safeTrim(text);
  if (!s) return s;
  if (hasCyrillic(s)) return s;

  try {
    var translated = LanguageApp.translate(s, 'en', 'ru');
    var out = safeTrim(translated);
    return out || s;
  } catch (_err) {
    return s;
  }
}

function hasCyrillic(text) {
  return /[А-Яа-яЁё]/.test(String(text || ''));
}

function normalizeTopLinks(rawLinks, itemUrlSet) {
  var links = Array.isArray(rawLinks) ? rawLinks : [];
  var out = [];
  var seen = {};

  links.forEach(function (l) {
    if (out.length >= OPENAI_CONFIG.MAX_LINKS_PER_GROUP) return;
    var link = l && typeof l === 'object' ? l : {};
    var url = normalizeUrl(link.url);
    if (!url) return;
    if (!itemUrlSet[url]) return;
    if (seen[url]) return;
    seen[url] = true;

    out.push({
      title: safeTrim(link.title) || url,
      url: url,
      source: safeTrim(link.source),
      publishedAt: toIso(link.publishedAt) || '',
    });
  });

  return out;
}
