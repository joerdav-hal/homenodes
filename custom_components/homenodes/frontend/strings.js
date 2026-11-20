// Interface text, gettext style: the English is the key, so call sites stay readable, and a
// translation maps it to another language. scripts/strings.mjs writes every message to
// translations/en.json for translators; CI fails if that file falls behind the code.

/** @typedef {Record<string, string>} Table */

/**
 * Translations by language code. English needs no table: a missing entry falls back to the key.
 * @type {Record<string, Table>}
 */
const TABLES = {};

/** @type {Table} */
let table = {};

/** Make a language's translations available, keyed by the English. @param {string} language @param {Table} messages */
export const addTranslations = (language, messages) => { TABLES[language.toLowerCase()] = { ...TABLES[language.toLowerCase()], ...messages }; };

/** Use a language's translations, or English if there are none. @param {string | null | undefined} language */
export const setLanguage = (language) => {
  const code = (language || "en").toLowerCase();
  table = TABLES[code] || TABLES[code.split("-")[0]] || {};
};

/**
 * A message in the current language. `{name}` placeholders are filled from vars.
 * Always pass a string literal, so scripts/strings.mjs can find it. Named tr, not t, because
 * t is a common variable name here (traces, triggers) and would shadow it.
 * @param {string} message The English text.
 * @param {Record<string, string | number | null | undefined>} [vars]
 */
export const tr = (message, vars) => {
  const text = table[message] ?? message;
  return vars ? text.replace(/\{(\w+)\}/g, (_, k) => isolate(String(vars[k] ?? ""))) : text;
};

// Right-to-left letters and direction controls.
const BIDI = /[\u0590-\u08ff\u200e\u200f\u202a-\u202e\u2066-\u2069\ufb1d-\ufdff\ufe70-\ufefc]/;
/**
 * A value that could change the direction of the text around it is wrapped in Unicode isolates
 * (FSI ... PDI), so a name can't reverse the sentence it is placed in. Others are left alone.
 * @param {string} value
 */
export const isolate = (value) => (BIDI.test(value) ? `\u2068${value.replace(/[\u202a-\u202e\u2066-\u2069]/g, "")}\u2069` : value);
