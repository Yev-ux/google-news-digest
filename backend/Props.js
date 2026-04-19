/**
 * ScriptProperties helpers.
 * Required properties:
 *  - SPREADSHEET_ID
 *  - AUTH_TOKEN
 */
const PROP_KEYS = Object.freeze({
  SPREADSHEET_ID: 'SPREADSHEET_ID',
  AUTH_TOKEN: 'AUTH_TOKEN',
  OPENAI_API_KEY: 'OPENAI_API_KEY',
  OPENAI_MODEL: 'OPENAI_MODEL',
  LAST_RUN_AT: 'LAST_RUN_AT',
  LAST_RUN_STATUS: 'LAST_RUN_STATUS',
  LAST_RUN_ERROR: 'LAST_RUN_ERROR',
  LAST_RUN_GROUPS: 'LAST_RUN_GROUPS',
  LAST_RUN_ITEMS: 'LAST_RUN_ITEMS',
});

function getScriptProps() {
  return PropertiesService.getScriptProperties();
}

function getRequiredProp(key) {
  const value = safeTrim(getScriptProps().getProperty(key));
  if (!value) {
    throw new Error('Missing required ScriptProperty: ' + key);
  }
  return value;
}

function getOptionalProp(key, defaultValue) {
  const value = safeTrim(getScriptProps().getProperty(key));
  return value || safeTrim(defaultValue);
}

function normalizeSpreadsheetId(raw) {
  const value = safeTrim(raw);
  if (!value) return '';

  const match = value.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (match && match[1]) return match[1];

  return value;
}

function getSpreadsheetId() {
  const raw = getRequiredProp(PROP_KEYS.SPREADSHEET_ID);
  const id = normalizeSpreadsheetId(raw);
  if (!id) {
    throw new Error('SPREADSHEET_ID is empty after normalization');
  }
  return id;
}

function getAuthToken() {
  return getRequiredProp(PROP_KEYS.AUTH_TOKEN);
}

function getOpenAIApiKey() {
  return getRequiredProp(PROP_KEYS.OPENAI_API_KEY);
}

function getOpenAIModel() {
  return getOptionalProp(PROP_KEYS.OPENAI_MODEL, 'gpt-4o-mini');
}

function setLastRunState(state) {
  const nowIso = new Date().toISOString();
  const payload = {
    [PROP_KEYS.LAST_RUN_AT]: nowIso,
    [PROP_KEYS.LAST_RUN_STATUS]: safeTrim(state.status),
    [PROP_KEYS.LAST_RUN_ERROR]: safeTrim(state.error || ''),
    [PROP_KEYS.LAST_RUN_GROUPS]: String(Number(state.groupsTotal || 0)),
    [PROP_KEYS.LAST_RUN_ITEMS]: String(Number(state.itemsAfterDedupTotal || 0)),
  };

  getScriptProps().setProperties(payload, false);
}

function getLastRunState() {
  var props = getScriptProps();
  return {
    lastRunAt: safeTrim(props.getProperty(PROP_KEYS.LAST_RUN_AT)),
    lastRunStatus: safeTrim(props.getProperty(PROP_KEYS.LAST_RUN_STATUS)),
    lastRunError: safeTrim(props.getProperty(PROP_KEYS.LAST_RUN_ERROR)),
    lastRunGroups: Number(props.getProperty(PROP_KEYS.LAST_RUN_GROUPS) || 0),
    lastRunItems: Number(props.getProperty(PROP_KEYS.LAST_RUN_ITEMS) || 0),
  };
}

/**
 * Optional helper to set both required properties quickly.
 */
function setRequiredProps(spreadsheetId, authToken) {
  const id = normalizeSpreadsheetId(spreadsheetId);
  const token = safeTrim(authToken);
  if (!id) throw new Error('spreadsheetId is empty');
  if (!token) throw new Error('authToken is empty');

  getScriptProps().setProperties({
    [PROP_KEYS.SPREADSHEET_ID]: id,
    [PROP_KEYS.AUTH_TOKEN]: token,
  }, true);
}
