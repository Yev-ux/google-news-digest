/**
 * Auth helpers for Apps Script Web App.
 *
 * IMPORTANT:
 * - Parameter name `auth` may be stripped by Google redirect chain on /exec for some requests.
 * - Therefore we accept multiple query names: auth | token | key.
 * - For POST we also accept body.auth | body.token | body.key.
 */

function firstNonEmpty(values) {
  for (var i = 0; i < values.length; i += 1) {
    var value = safeTrim(values[i]);
    if (value) return value;
  }
  return '';
}

function extractAuthToken(e, bodyObj) {
  var query = (e && e.parameter) ? e.parameter : {};
  var queryToken = firstNonEmpty([
    query.auth,
    query.token,
    query.key,
  ]);
  if (queryToken) return queryToken;

  var body = (bodyObj && typeof bodyObj === 'object') ? bodyObj : {};
  return firstNonEmpty([
    body.auth,
    body.token,
    body.key,
  ]);
}

function checkAuth(authToken) {
  var expected = getAuthToken();
  return safeTrim(authToken) !== '' && authToken === expected;
}
