import assert from "node:assert/strict";
import { test } from "node:test";
import { addTranslations, setLanguage, tr } from "../../custom_components/homenodes/frontend/strings.js";
import { ago } from "../../custom_components/homenodes/frontend/format.js";

test("English is the key, with placeholders filled", () => {
  setLanguage("en");
  assert.equal(tr("Up next"), "Up next");
  assert.equal(tr("{name} changed", { name: "Hall motion" }), "Hall motion changed");
});

test("a translation is used for its language and its regional variants", () => {
  addTranslations("xx", { "Up next": "Bientôt", "{n}m": "{n} min", "{time} ago": "il y a {time}" });
  setLanguage("xx-YY");
  assert.equal(tr("Up next"), "Bientôt");
  assert.equal(ago(Date.now() - 5 * 60e3), "il y a 5 min", "computed phrases translate too");
  assert.equal(tr("History"), "History", "anything untranslated falls back to English");
  setLanguage("en");
  assert.equal(tr("Up next"), "Up next");
});

test("a right-to-left name is isolated, so it can't reverse the sentence around it", async () => {
  const { isolate } = await import("../../custom_components/homenodes/frontend/strings.js");
  assert.equal(tr("{name} doesn't exist", { name: "Kitchen" }), "Kitchen doesn't exist");
  assert.equal(tr("{name} doesn't exist", { name: "מטבח" }), "⁨מטבח⁩ doesn't exist");
  // An unterminated override is dropped and the value is closed off.
  assert.equal(isolate("‮evil"), "⁨evil⁩");
  assert.equal(isolate("a⁩b"), "⁨ab⁩");
  assert.equal(isolate("12 °C"), "12 °C");
});
