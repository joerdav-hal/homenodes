import assert from "node:assert/strict";
import { test } from "node:test";
import { Latest, reason, TimeoutError, within } from "../../custom_components/homenodes/frontend/query.js";

test("within passes results and errors through", async () => {
  assert.equal(await within(Promise.resolve(4), 50), 4);
  await within(Promise.reject(new Error("nope")), 50).then(() => assert.fail("should reject"), (e) => assert.equal(e.message, "nope"));
});

test("within gives up with a TimeoutError", async () => {
  const never = new Promise(() => {});
  await within(never, 10).then(() => assert.fail("should time out"), (e) => assert.ok(e instanceof TimeoutError));
});

test("only the newest request of a kind is current", () => {
  const latest = new Latest();
  const a = latest.take("history"), b = latest.take("history"), heat = latest.take("heat");
  assert.equal(a(), false);
  assert.equal(b(), true);
  assert.equal(heat(), true);
  latest.cancelAll();
  assert.equal(b(), false);
  assert.equal(heat(), false);
});

test("reasons are short text, whatever was thrown", () => {
  assert.equal(reason({ code: "unknown_command" }), "unknown_command");
  assert.equal(reason(new Error("x".repeat(500))).length, 200);
  assert.equal(reason(undefined), "error");
});
