import assert from "node:assert/strict";
import { test } from "node:test";
import { makeHouse } from "../dev/fake-house.js";
import { blueprintName, expandBlueprints } from "../custom_components/homenodes/frontend/blueprints.js";
import { buildGraph } from "../custom_components/homenodes/frontend/graph.js";

const house = makeHouse({ now: new Date(2026, 10, 20, 18, 30).getTime() });
/** Fakes blueprint/substitute from the fake house, counting calls. */
const fakeSend = () => {
  const calls = { n: 0 };
  /** @param {Record<string, any>} m */
  const send = async (m) => {
    calls.n++;
    const hit = house.blueprintSubstitutions[JSON.stringify([m.domain, m.path, m.input])];
    if (!hit) throw { code: "unknown_error", message: `Failed to load blueprint: Unable to find ${m.path}` };
    return { substituted_config: hit };
  };
  return { send, calls };
};

test("blueprint automations expand into the config they run", async () => {
  const { send } = fakeSend();
  const { configs, blueprints } = await expandBlueprints(house.configs, "automation", send);
  const garden = configs["automation.garden_motion"];
  assert.equal(garden.use_blueprint, undefined);
  assert.equal(garden.alias, "[Garden] Motion light", "its own alias is kept");
  assert.equal(garden.triggers[0].entity_id, "binary_sensor.garden_motion");
  assert.deepEqual(blueprints["automation.garden_motion"], { path: "homeassistant/motion_light.yaml", input: house.configs["automation.garden_motion"].use_blueprint.input });
  assert.equal(configs["automation.hall_light"], house.configs["automation.hall_light"], "others pass through untouched");
});

test("a blueprint that can't be loaded is reported, not fatal", async () => {
  const { send } = fakeSend();
  const { configs, blueprints } = await expandBlueprints(house.configs, "automation", send);
  assert.match(blueprints["automation.office_remote"].error || "", /Unable to find someone\/removed_remote\.yaml/);
  assert.ok(configs["automation.office_remote"].use_blueprint, "left as it was");
});

test("an old Home Assistant without blueprint/substitute says so", async () => {
  const send = async () => { throw { code: "unknown_command", message: "Unknown command." }; };
  const { blueprints } = await expandBlueprints(house.configs, "automation", send);
  assert.equal(blueprints["automation.garden_motion"].error, "This version of Home Assistant can't expand blueprints");
});

test("expansions are cached by blueprint and inputs", async () => {
  const { send, calls } = fakeSend();
  const cache = new Map();
  await expandBlueprints(house.configs, "automation", send, cache);
  const first = calls.n;
  await expandBlueprints(house.configs, "automation", send, cache);
  assert.equal(calls.n - first, 1, "only the failed one is asked again");
});

test("expanded blueprints draw wires, including device actions in script blueprints", async () => {
  const { send } = fakeSend();
  const autos = await expandBlueprints(house.configs, "automation", send);
  const scripts = await expandBlueprints(house.scriptConfigs, "script", send);
  const g = buildGraph({ ...house, configs: autos.configs, scriptConfigs: scripts.configs, blueprints: { ...autos.blueprints, ...scripts.blueprints } });
  /** @param {string} a @param {string} b */
  const wire = (a, b) => g.edges.find((e) => e.src === a && e.dst === b);
  assert.equal(wire("binary_sensor.garden_motion", "automation.garden_motion")?.role, "trigger");
  assert.ok(wire("automation.garden_motion", "light.garden"));
  assert.ok(wire("script.ask_heating", "device:dev_phone"));
  assert.ok(wire("script.ask_heating", "climate.thermostat"));
  assert.equal(g.nodes.find((n) => n.id === "automation.garden_motion")?.blueprint?.path, "homeassistant/motion_light.yaml");
  assert.ok(g.nodes.find((n) => n.id === "automation.office_remote")?.blueprint?.error);
});

test("blueprintName reads well", () => {
  assert.equal(blueprintName("homeassistant/motion_light.yaml"), "motion light");
  assert.equal(blueprintName("Malte/zha-ikea-four-button-remote.yaml"), "zha ikea four button remote");
});
