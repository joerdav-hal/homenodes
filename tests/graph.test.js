import assert from "node:assert/strict";
import { test } from "node:test";
import { makeHouse } from "../dev/fake-house.js";
import { buildGraph, resolvePath, summarize } from "../custom_components/homenodes/frontend/graph.js";

const house = makeHouse({ now: new Date(2026, 10, 20, 18, 30).getTime() });
const g = buildGraph(house);
const node = (/** @type {string} */ id) => g.nodes.find((n) => n.id === id);
/** @param {string} src @param {string} dst */
const wire = (src, dst) => g.edges.find((e) => e.src === src && e.dst === dst);

test("a state trigger, a condition and an action become wires", () => {
  assert.equal(wire("binary_sensor.kitchen_motion", "automation.kitchen_motion_lights")?.role, "trigger");
  assert.equal(wire("light.kitchen_ceiling", "automation.kitchen_motion_lights")?.role, "condition");
  assert.equal(wire("automation.kitchen_motion_lights", "light.kitchen_ceiling")?.role, "action");
  assert.equal(wire("automation.kitchen_motion_lights", "light.kitchen_counter")?.role, "action");
});

test("an entity used as both trigger and condition is drawn once, as a trigger", () => {
  assert.equal(wire("sensor.washer_power", "automation.kitchen_washer")?.role, "trigger");
});

test("templates are scanned for the entities they name", () => {
  assert.equal(wire("sensor.outdoor_temperature", "automation.front_door")?.role, "condition");
});

test("entity_id: all becomes one group node", () => {
  assert.equal(node("all:light")?.kind, "virtual");
  assert.ok(wire("automation.everyone_left", "all:light"));
});

test("an area target expands to that area's entities of the service's domain", () => {
  assert.ok(wire("script.goodnight", "light.bedroom"), "a light on a device in the bedroom");
  assert.ok(wire("script.goodnight", "light.living_lamp"));
  assert.ok(wire("script.goodnight", "light.living_ceiling"));
  assert.equal(wire("script.goodnight", "media_player.living_tv"), undefined);
});

test("device triggers and registry-id device actions resolve", () => {
  assert.equal(node("device:dev_bedroom_remote")?.kind, "device");
  assert.equal(wire("device:dev_bedroom_remote", "automation.bedroom_remote")?.role, "trigger");
  assert.ok(wire("automation.bedroom_remote", "light.bedroom"));
});

test("a script call is an action wire to the script", () => {
  assert.equal(wire("automation.movie_mode", "script.movie_time")?.role, "action");
  assert.ok(wire("script.movie_time", "light.living_lamp"));
});

test("a templated service with a literal target still reaches the target", () => {
  assert.ok(wire("automation.garden_lights", "light.garden"));
});

test("a templated target with no known entity becomes a service node", () => {
  assert.ok(wire("automation.party_lights", "svc:light.turn_on"));
  assert.ok(wire("automation.kitchen_washer", "svc:notify.mobile_app_phone"));
});

test("clock-like triggers become schedule nodes", () => {
  for (const id of ["time:23:00:00", "time:06:30:00", "sun:sunset -00:15:00", "pattern://30/", "ha:start"]) assert.equal(node(id)?.kind, "time", id);
  assert.deepEqual(node("time:06:30:00")?.schedule, { type: "time", at: "06:30:00" });
  assert.equal(node("time:23:00:00")?.label, "23:00");
  assert.equal(wire("input_datetime.wake_up", "automation.kitchen_coffee")?.role, "trigger");
  assert.deepEqual(node("automation.kitchen_coffee")?.dtTriggers, ["input_datetime.wake_up"]);
});

test("broken references, snapshots and unreadable configs are marked", () => {
  assert.equal(node("light.old_lamp")?.missing, true);
  const snap = node("scene.kitchen_before");
  assert.equal(snap?.missing, false);
  assert.equal(snap?.snapshot, true);
  assert.equal(snap?.label, "kitchen before (snapshot)");
  assert.equal(node("automation.desk_fan")?.broken, "Entity not found");
});

test("a [Tag] prefix is stripped from the label", () => {
  assert.equal(node("automation.kitchen_motion_lights")?.label, "Lights on with motion");
  assert.equal(node("automation.kitchen_motion_lights")?.tags?.[0], "Kitchen");
});

test("area grouping: the automation's area, then a [Tag] naming an area, then its targets' area", () => {
  assert.equal(node("automation.garden_lights")?.cluster, "Garden", "its registry area");
  assert.equal(node("automation.kitchen_motion_lights")?.cluster, "Kitchen", "the [Kitchen] tag");
  assert.equal(node("automation.heating_morning")?.cluster, "Living room", "where the thermostat it sets is");
  assert.equal(node("automation.half_hourly")?.cluster, "No area", "nothing it touches has an area");
  assert.equal(node("script.movie_time")?.cluster, "Living room");
  assert.equal(node("binary_sensor.kitchen_motion")?.cluster, "Kitchen");
});

test("tag grouping keeps the original behaviour", () => {
  const t = buildGraph({ ...house, grouping: "tag" });
  const zone = (/** @type {string} */ id) => t.nodes.find((n) => n.id === id)?.cluster;
  assert.equal(zone("automation.garden_lights"), "Other");
  assert.equal(zone("automation.heating_morning"), "Heating");
  assert.equal(zone("automation.kitchen_motion_lights"), "Kitchen");
  assert.equal(zone("script.movie_time"), "Scripts");
});

test("label and category grouping use the registries' names", () => {
  const l = buildGraph({ ...house, grouping: "label" });
  const lzone = (/** @type {string} */ id) => l.nodes.find((n) => n.id === id)?.cluster;
  assert.equal(lzone("automation.kitchen_motion_lights"), "Lighting");
  assert.equal(lzone("automation.front_door"), "Lighting", "the first label by name");
  assert.equal(lzone("automation.hall_light"), "No label");
  const c = buildGraph({ ...house, grouping: "category" });
  const czone = (/** @type {string} */ id) => c.nodes.find((n) => n.id === id)?.cluster;
  assert.equal(czone("automation.heating_morning"), "Comfort");
  assert.equal(czone("automation.hall_light"), "No category");
});

test("refsOf finds what a piece of config refers to", () => {
  const cfg = house.configs["automation.hall_light"];
  assert.deepEqual(g.refsOf(cfg.triggers[0], "trigger"), ["binary_sensor.hall_motion"]);
  assert.deepEqual(g.refsOf(cfg.actions, "action").sort(), ["light.hall"]);
  assert.deepEqual(g.refsOf(house.configs["automation.kitchen_coffee"].triggers, "trigger"), ["input_datetime.wake_up"]);
});

test("resolve turns entity_id values into entity ids", () => {
  assert.deepEqual(g.resolve("light.a, light.b"), ["light.a", "light.b"]);
  assert.deepEqual(g.resolve(["all", "none"]), ["all", "none"]);
  assert.deepEqual(g.resolve("{{ is_state('light.hall', 'on') }}"), ["light.hall"]);
});

test("resolvePath walks trace paths into the config", () => {
  const cfg = house.configs["automation.kitchen_motion_lights"];
  assert.deepEqual(resolvePath(cfg, "condition/0/entity_id/0"), { node: cfg.conditions[0], entityIndex: 0 });
  assert.equal(resolvePath(cfg, "action/0/choose/0/conditions/0").node.condition, "sun");
  assert.equal(resolvePath(cfg, "action/0/choose/0/sequence/0").node.action, "light.turn_on");
  assert.equal(resolvePath(cfg, "action/0/default/0").node.target.entity_id, "light.kitchen_counter");
  assert.equal(resolvePath(cfg, "trigger/0").node.entity_id, "binary_sensor.kitchen_motion");
});

test("summarize says a trigger in a few words", () => {
  assert.equal(summarize({ trigger: "time", at: "06:30:00" }), "06:30");
  assert.equal(summarize({ trigger: "time_pattern", minutes: "/30" }), "every 30m");
  assert.equal(summarize({ trigger: "sun", event: "sunset", offset: "-00:15:00" }), "sunset -00:15:00");
  assert.equal(summarize({ trigger: "state", entity_id: "light.x" }), null);
  assert.equal(summarize({ trigger: "time", at: "06:30:00", enabled: false }), null);
});

test("repeating the house scales the graph without collisions", () => {
  const big = buildGraph(makeHouse({ copies: 3 }));
  assert.equal(big.nodes.filter((n) => n.kind === "automation").length, 3 * 19);
  assert.equal(new Set(big.nodes.map((n) => n.id)).size, big.nodes.length);
});
