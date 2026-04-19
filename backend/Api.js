/**
 * Web App API router.
 * Endpoints (Apps Script Web App):
 * - GET  /exec?route=preferences&token=TOKEN     (auth also accepted)
 * - POST /exec?route=preferences&token=TOKEN     (auth/key also accepted, plus body auth/token/key)
 * - GET  /exec?route=summaries_today&token=TOKEN
 * - GET  /exec?route=run&token=TOKEN             (manual full pipeline)
 * - GET  /exec?route=status&token=TOKEN
 * - GET  /exec?route=collect_debug&token=TOKEN&kind=ticker&value=GOOGL
 */

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function parseJsonBody(e) {
  if (!e || !e.postData || !e.postData.contents) return {};
  const raw = safeTrim(e.postData.contents);
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_err) {
    return {};
  }
}

function doGet(e) {
  try {
    const route = e && e.parameter ? safeTrim(e.parameter.route) : '';
    const authToken = extractAuthToken(e, null);

    if (!checkAuth(authToken)) {
      return jsonResponse({ ok: false, error: 'Unauthorized' });
    }

    if (route === 'preferences') {
      return jsonResponse(getPreferencesFromSheets());
    }

    if (route === 'summaries_today') {
      return jsonResponse(getSummariesTodayResponse());
    }

    if (route === 'run') {
      return jsonResponse(manualRun());
    }

    if (route === 'status') {
      return jsonResponse(getRunStatusResponse());
    }

    if (route === 'collect_debug') {
      const kind = e && e.parameter ? safeTrim(e.parameter.kind) : '';
      const value = e && e.parameter ? safeTrim(e.parameter.value) : '';
      return jsonResponse(runCollectOnly({ kind: kind, value: value }));
    }

    return jsonResponse({ ok: false, error: 'Unknown route' });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function doPost(e) {
  try {
    const route = e && e.parameter ? safeTrim(e.parameter.route) : '';
    const body = parseJsonBody(e);
    const authToken = extractAuthToken(e, body);

    if (!checkAuth(authToken)) {
      return jsonResponse({ ok: false, error: 'Unauthorized' });
    }

    if (route === 'preferences') {
      const tickers = Array.isArray(body.tickers) ? body.tickers : [];
      const topics = Array.isArray(body.topics) ? body.topics : [];
      return jsonResponse(savePreferencesToSheets(tickers, topics));
    }

    return jsonResponse({ ok: false, error: 'Unknown route' });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}
