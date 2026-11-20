// A made-up house for the dev harness and the tests. Nothing here comes from a real Home
// Assistant, so it is safe to publish. It exercises every kind of config HomeNodes reads.

/** @typedef {import("../types/ha").HassEntity} HassEntity */
/** @typedef {import("../types/ha").EntityRegistryEntry} EntityRegistryEntry */
/** @typedef {import("../types/ha").DeviceRegistryEntry} DeviceRegistryEntry */
/** @typedef {import("../types/ha").AreaRegistryEntry} AreaRegistryEntry */
/** @typedef {import("../types/ha").HistoryRow} HistoryRow */
/** @typedef {import("../types/ha").LogbookEntry} LogbookEntry */
/** @typedef {import("../types/ha").TraceSummary} TraceSummary */
/** @typedef {import("../types/ha").TraceDetail} TraceDetail */
/** @typedef {import("../types/ha").HassEvent} HassEvent */
/** @typedef {import("../types/ha").Config} Config */
/** @typedef {import("../types/ha").RenderTemplateResult} RenderTemplateResult */
/** @typedef {import("../types/ha").LabelRegistryEntry} LabelRegistryEntry */
/** @typedef {import("../types/ha").CategoryRegistryEntry} CategoryRegistryEntry */

/**
 * @typedef {object} House
 * @property {HassEntity[]} states
 * @property {Record<string, Config>} configs Automation configs by entity id; `{ error }` if unreadable.
 * @property {Record<string, Config>} scriptConfigs
 * @property {EntityRegistryEntry[]} entities
 * @property {DeviceRegistryEntry[]} devices
 * @property {AreaRegistryEntry[]} areas
 * @property {LabelRegistryEntry[]} labels
 * @property {Record<"automation" | "script", CategoryRegistryEntry[]>} categories By scope.
 * @property {Record<string, Config>} blueprintSubstitutions What blueprint/substitute returns, by JSON [domain, path, input].
 * @property {string[]} yamlDefined Automation ids defined in YAML packages, so the UI's config API can't load them.
 * @property {Record<string, { list: TraceSummary[], runs: Record<string, TraceDetail> }>} traces By "domain:item_id".
 * @property {Record<string, HistoryRow[]>} history The last 24 hours.
 * @property {LogbookEntry[]} logbook
 * @property {Record<string, RenderTemplateResult>} templates One render of each template condition.
 * @property {{ t: number, event: HassEvent }[]} events A minute of live activity to replay; t is epoch ms.
 */

/** A small seeded random generator, so every run builds the same house. @param {number} seed */
const rng = (seed) => () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/**
 * @param {{ now?: number, copies?: number }} [options] copies repeats the house to test larger installs.
 * @returns {House}
 */
export function makeHouse({ now = Date.now(), copies = 1 } = {}) {
  /** @type {House} */
  const house = { states: [], configs: {}, scriptConfigs: {}, entities: [], devices: [], areas: [], traces: {}, history: {}, logbook: [], templates: {}, events: [],
    labels: [{ label_id: "lighting", name: "Lighting" }, { label_id: "security", name: "Security" }],
    categories: { automation: [{ category_id: "cat_comfort", name: "Comfort" }], script: [] },
    blueprintSubstitutions: {}, yamlDefined: [] };
  const iso = (/** @type {number} */ t) => new Date(t).toISOString();
  const min = 60e3, hour = 3600e3;
  let ctxN = 0;
  const ctx = () => ({ id: `ctx${String(++ctxN).padStart(6, "0")}`, parent_id: null, user_id: null });
  const regId = (/** @type {string} */ eid) => Array.from(eid).reduce((a, c) => (a * 33 + c.charCodeAt(0)) >>> 0, 5381).toString(16).padStart(8, "0").repeat(4);

  for (let k = 1; k <= copies; k++) {
    const sfx = k === 1 ? "" : `_${k}`, name = k === 1 ? "" : ` ${k}`;
    const area = (/** @type {string} */ id, /** @type {string} */ label) => { house.areas.push({ area_id: id + sfx, name: label + name }); return id + sfx; };
    const kitchen = area("kitchen", "Kitchen"), living = area("living_room", "Living room"), hall = area("hall", "Hall");
    const bedroom = area("bedroom", "Bedroom"), garden = area("garden", "Garden"), office = area("office", "Office");
    const device = (/** @type {string} */ id, /** @type {string} */ label, /** @type {string} */ a) => { house.devices.push({ id: id + sfx, name: label + name, name_by_user: null, area_id: a }); return id + sfx; };
    const kitchenSensor = device("dev_kitchen_motion", "Kitchen motion sensor", kitchen);
    const remote = device("dev_bedroom_remote", "Bedroom remote", bedroom);
    const bedroomBulb = device("dev_bedroom_bulb", "Bedroom bulb", bedroom);
    const phone = device("dev_phone", "Alex's phone", "");

    /**
     * @param {string} eid @param {string} label @param {string} state
     * @param {{ area?: string | null, device?: string | null, attrs?: Record<string, any>, changed?: number }} [o]
     */
    const entity = (eid, label, state, o = {}) => {
      const id = eid + sfx;
      house.states.push({ entity_id: id, state, attributes: { friendly_name: label + name, ...o.attrs }, last_changed: iso(now - (o.changed ?? 3 * hour)), last_updated: iso(now - (o.changed ?? 3 * hour)) });
      house.entities.push({ id: regId(id), entity_id: id, device_id: o.device ?? null, area_id: o.device ? null : o.area ?? null, disabled_by: null });
      return id;
    };
    const kCeiling = entity("light.kitchen_ceiling", "Kitchen ceiling", "off", { area: kitchen });
    const kCounter = entity("light.kitchen_counter", "Kitchen counter", "on", { area: kitchen, changed: 40 * min });
    const kMotion = entity("binary_sensor.kitchen_motion", "Kitchen motion", "off", { device: kitchenSensor, attrs: { device_class: "occupancy" }, changed: 12 * min });
    const coffee = entity("switch.coffee_machine", "Coffee machine", "off", { area: kitchen });
    const washer = entity("sensor.washer_power", "Washing machine power", "2.3", { area: kitchen, attrs: { unit_of_measurement: "W", device_class: "power" } });
    const hallLight = entity("light.hall", "Hall light", "off", { area: hall });
    const hMotion = entity("binary_sensor.hall_motion", "Hall motion", "off", { area: hall, attrs: { device_class: "motion" } });
    const door = entity("binary_sensor.front_door", "Front door", "off", { area: hall, attrs: { device_class: "door" } });
    const lamp = entity("light.living_lamp", "Living room lamp", "on", { area: living, changed: 90 * min });
    const lCeiling = entity("light.living_ceiling", "Living room ceiling", "off", { area: living });
    entity("binary_sensor.living_motion", "Living room motion", "on", { area: living, changed: 5 * min });
    const tv = entity("media_player.living_tv", "TV", "playing", { area: living, changed: 25 * min });
    const movie = entity("scene.movie", "Movie scene", iso(now - 2 * 86400e3), { area: living });
    const bedLight = entity("light.bedroom", "Bedroom light", "off", { device: bedroomBulb });
    const gardenLight = entity("light.garden", "Garden lights", "off", { area: garden });
    const gardenMotion = entity("binary_sensor.garden_motion", "Garden motion", "off", { area: garden, attrs: { device_class: "motion" } });
    const officeLight = entity("light.office", "Office light", "off", { area: office });
    entity("sensor.outdoor_temperature", "Outdoor temperature", "6.5", { area: garden, attrs: { unit_of_measurement: "°C", device_class: "temperature" } });
    const thermostat = entity("climate.thermostat", "Thermostat", "heat", { area: living, attrs: { temperature: 20, current_temperature: 19.5 } });
    const guest = entity("input_boolean.guest_mode", "Guest mode", "off");
    const vacation = entity("input_boolean.vacation", "Vacation", "off");
    const wake = entity("input_datetime.wake_up", "Wake-up time", "07:00:00", { attrs: { has_date: false, has_time: true } });

    if (k === 1) {
      entity("person.alex", "Alex", "home", { changed: 6 * hour });
      entity("person.sam", "Sam", "not_home", { changed: 2 * hour });
      entity("zone.home", "Home", "1", { attrs: { persons: ["person.alex"] } });
      const rise = new Date(now); rise.setHours(7, 32, 0, 0); if (rise.getTime() <= now) rise.setDate(rise.getDate() + 1);
      const set = new Date(now); set.setHours(16, 8, 0, 0); if (set.getTime() <= now) set.setDate(set.getDate() + 1);
      entity("sun.sun", "Sun", set.getTime() < rise.getTime() ? "above_horizon" : "below_horizon", { attrs: { next_rising: iso(rise.getTime()), next_setting: iso(set.getTime()) } });
    }

    /**
     * @param {string} id @param {string} alias @param {Config} config
     * @param {{ state?: string, last?: number | null, area?: string, error?: string, labels?: string[], category?: string, yaml?: boolean }} [o]
     */
    const automation = (id, alias, config, o = {}) => {
      if (o.yaml) house.yamlDefined.push(id + sfx);
      const eid = `automation.${id}${sfx}`;
      const last = o.last === undefined ? 3 * hour : o.last;
      house.states.push({ entity_id: eid, state: o.state ?? "on", attributes: { friendly_name: alias + name, id: id + sfx, last_triggered: last == null ? null : iso(now - last), mode: config.mode || "single", current: 0 }, last_changed: iso(now - 86400e3), last_updated: iso(now - (last ?? 86400e3)) });
      house.entities.push({ id: regId(eid), entity_id: eid, device_id: null, area_id: o.area ?? null, disabled_by: null, labels: o.labels ?? [], categories: o.category ? { automation: o.category } : {} });
      house.configs[eid] = o.error ? { error: o.error } : { id: id + sfx, alias: alias + name, description: "", ...config };
      return eid;
    };
    /** @param {string} id @param {string} alias @param {Config} config */
    const script = (id, alias, config) => {
      const eid = `script.${id}${sfx}`;
      house.states.push({ entity_id: eid, state: "off", attributes: { friendly_name: alias + name, last_triggered: iso(now - 26 * hour), mode: "single" }, last_changed: iso(now - 86400e3), last_updated: iso(now - 26 * hour) });
      house.entities.push({ id: regId(eid), entity_id: eid, device_id: null, area_id: null, disabled_by: null });
      house.scriptConfigs[eid] = { alias: alias + name, ...config };
      return eid;
    };

    const movieTime = script("movie_time", "Movie time", { sequence: [
      { action: "light.turn_off", target: { entity_id: lCeiling } },
      { action: "light.turn_on", target: { entity_id: lamp }, data: { brightness_pct: 30 } },
    ] });
    script("goodnight", "Goodnight", { fields: { temperature: { name: "Temperature", default: 17, selector: { number: { min: 10, max: 25 } } } }, sequence: [
      { action: "light.turn_off", target: { area_id: [bedroom, living] } },
      { action: "climate.set_temperature", target: { entity_id: thermostat }, data: { temperature: "{{ temperature | default(17) }}" } },
    ] });
    // A script made from Home Assistant's confirmable notification blueprint.
    const askInput = { notify_device: phone, message: "Turn the heating up?", confirm_action: [{ action: "climate.set_temperature", target: { entity_id: thermostat }, data: { temperature: 22 } }] };
    script("ask_heating", "Ask about the heating", { use_blueprint: { path: "homeassistant/confirmable_notification.yaml", input: askInput } });
    house.blueprintSubstitutions[JSON.stringify(["script", "homeassistant/confirmable_notification.yaml", askInput])] = { mode: "restart", sequence: [
      { alias: "Send notification", domain: "mobile_app", type: "notify", device_id: phone, message: "Turn the heating up?" },
      { alias: "Awaiting response", wait_for_trigger: [{ platform: "event", event_type: "mobile_app_notification_action" }] },
      { choose: [{ conditions: "{{ wait.trigger.event.data.action == 'CONFIRM' }}", sequence: askInput.confirm_action }] },
    ] };

    const motionLights = automation("kitchen_motion_lights", "[Kitchen] Lights on with motion", {
      description: "Main light after dark, the counter light by day.",
      triggers: [{ trigger: "state", entity_id: kMotion, to: "on" }],
      conditions: [{ condition: "state", entity_id: kCeiling, state: "off" }],
      actions: [{ choose: [{ conditions: [{ condition: "sun", after: "sunset" }], sequence: [{ action: "light.turn_on", target: { entity_id: kCeiling } }] }],
        default: [{ action: "light.turn_on", target: { entity_id: kCounter } }] }],
    }, { last: 12 * min, labels: ["lighting"] });
    automation("kitchen_lights_off", "[Kitchen] Lights off when empty", {
      triggers: [{ trigger: "state", entity_id: kMotion, to: "off", for: { minutes: 10 } }],
      actions: [
        { action: "scene.create", data: { scene_id: `kitchen_before${sfx}`, snapshot_entities: [kCeiling, kCounter] } },
        { action: "light.turn_off", target: { entity_id: [kCeiling, kCounter] } },
      ],
    }, { last: 2 * hour });
    automation("kitchen_coffee", "[Kitchen] Coffee on weekday mornings", {
      triggers: [{ trigger: "time", at: wake }],
      conditions: [{ condition: "state", entity_id: vacation, state: "off" }, { condition: "time", weekday: ["mon", "tue", "wed", "thu", "fri"] }],
      actions: [{ action: "switch.turn_on", target: { entity_id: coffee } }],
    }, { last: 30 * hour });
    automation("kitchen_washer", "[Kitchen] Washing finished", {
      triggers: [{ trigger: "numeric_state", entity_id: washer, below: 5, for: "00:03:00" }],
      conditions: [`{{ states('${washer}') | float(0) < 5 }}`],
      actions: [{ action: "notify.mobile_app_phone", data: { title: "Washing", message: "The washing is done." } }],
    }, { last: 5 * hour });
    automation("hall_light", "[Hall] Light follows motion", {
      triggers: [{ id: "on", trigger: "state", entity_id: hMotion, to: "on" }, { id: "off", trigger: "state", entity_id: hMotion, to: "off", for: { minutes: 2 } }],
      actions: [{ choose: [
        { conditions: [{ condition: "trigger", id: "on" }], sequence: [{ action: "light.turn_on", target: { entity_id: hallLight }, data: { brightness_pct: 50 } }] },
        { conditions: [{ condition: "trigger", id: "off" }], sequence: [{ action: "light.turn_off", target: { entity_id: hallLight } }] },
      ] }],
      mode: "restart",
    }, { last: 8 * min });
    automation("front_door", "[Hall] Front door opened while away", {
      triggers: [{ trigger: "state", entity_id: door, to: "on" }],
      conditions: [{ condition: "numeric_state", entity_id: "zone.home", below: 1 }],
      actions: [{ action: "notify.mobile_app_phone", data: { message: "Front door opened. It's {{ states('sensor.outdoor_temperature" + sfx + "') }}° outside." } }],
    }, { last: 4 * 86400e3, labels: ["security", "lighting"] });
    automation("movie_mode", "[Living room] Movie mode", {
      triggers: [{ trigger: "state", entity_id: tv, to: "playing" }],
      conditions: [{ condition: "sun", after: "sunset" }],
      actions: [{ action: "scene.turn_on", target: { entity_id: movie } }, { action: movieTime }],
    }, { last: 25 * min });
    automation("garden_lights", "Garden lights", {
      triggers: [{ id: "on", trigger: "sun", event: "sunset", offset: "-00:15:00" }, { id: "off", trigger: "time", at: "23:00:00" }],
      actions: [{ action: "light.turn_{{ 'on' if trigger.id == 'on' else 'off' }}", target: { entity_id: gardenLight } }],
    }, { area: garden, last: 20 * hour });
    automation("everyone_left", "[House] Everyone left", {
      triggers: [{ trigger: "numeric_state", entity_id: "zone.home", below: 1, for: { minutes: 5 } }],
      conditions: [{ condition: "state", entity_id: guest, state: "off" }],
      actions: [{ action: "light.turn_off", target: { entity_id: "all" } }, { action: "media_player.media_stop", target: { entity_id: tv } }],
    }, { last: 2 * 86400e3, yaml: true });
    automation("heating_morning", "[Heating] Morning warm-up", {
      triggers: [{ trigger: "time", at: "06:30:00" }],
      conditions: [{ condition: "or", conditions: [{ condition: "state", entity_id: "person.alex", state: "home" }, { condition: "state", entity_id: "person.sam", state: "home" }] }],
      actions: [{ action: "climate.set_temperature", target: { entity_id: thermostat }, data: { temperature: 21 } }],
    }, { last: 10 * hour, category: "cat_comfort", yaml: true });
    automation("bedroom_remote", "[Bedroom] Remote button", {
      triggers: [{ trigger: "device", device_id: remote, domain: "zha", type: "remote_button_short_press", subtype: "turn_on" }],
      actions: [{ type: "toggle", device_id: bedroomBulb, entity_id: regId(bedLight), domain: "light" }],
    }, { last: 14 * hour });
    automation("half_hourly", "[System] Half-hourly check", {
      triggers: [{ trigger: "time_pattern", minutes: "/30" }],
      conditions: [{ condition: "template", value_template: `{{ is_state('${guest}', 'off') }}` }],
      actions: [{ action: "persistent_notification.create", data: { message: "Still running." } }],
    }, { last: 20 * min });
    automation("startup", "[System] On startup", {
      triggers: [{ trigger: "homeassistant", event: "start" }],
      actions: [{ action: "input_boolean.turn_off", target: { entity_id: guest } }],
    }, { last: 3 * 86400e3 });
    automation("party_lights", "[House] Lights by event", {
      triggers: [{ trigger: "event", event_type: "party" }],
      actions: [{ action: "light.turn_on", target: { entity_id: "{{ trigger.event.data.light }}" } }],
    }, { last: null });
    automation("old_lamp", "[Living room] Old lamp at dusk", {
      triggers: [{ trigger: "sun", event: "sunset" }],
      actions: [{ action: "light.turn_on", target: { entity_id: `light.old_lamp${sfx}` } }],
    }, { last: 60 * 86400e3 });
    automation("desk_fan", "[Office] Desk fan", {}, { state: "unavailable", error: "Entity not found", last: null });
    automation("office_light", "[Office] Office light at eight", {
      triggers: [{ trigger: "time", at: "08:00:00" }],
      actions: [{ action: "light.turn_on", target: { entity_id: officeLight } }],
    }, { state: "off", last: 40 * 86400e3 });
    // Two blueprint automations: Home Assistant's own motion light, and one whose blueprint is gone.
    const motionInput = { motion_entity: gardenMotion, light_target: { entity_id: gardenLight }, no_motion_wait: 120 };
    automation("garden_motion", "[Garden] Motion light", { use_blueprint: { path: "homeassistant/motion_light.yaml", input: motionInput } }, { area: garden, last: 3 * hour });
    house.blueprintSubstitutions[JSON.stringify(["automation", "homeassistant/motion_light.yaml", motionInput])] = {
      mode: "restart", max_exceeded: "silent",
      triggers: [{ platform: "state", entity_id: gardenMotion, from: "off", to: "on" }],
      actions: [
        { alias: "Turn on the light", action: "light.turn_on", target: { entity_id: gardenLight } },
        { alias: "Wait until there is no motion", wait_for_trigger: { platform: "state", entity_id: gardenMotion, from: "on", to: "off" } },
        { alias: "Wait the number of seconds", delay: 120 },
        { alias: "Turn off the light", action: "light.turn_off", target: { entity_id: gardenLight } },
      ],
    };
    automation("office_remote", "[Office] Remote (old blueprint)", { use_blueprint: { path: "someone/removed_remote.yaml", input: { remote: "dev_missing" } } }, { last: 90 * 86400e3 });

    // Live template results, as render_template would report them.
    house.templates[`{{ states('${washer}') | float(0) < 5 }}`] = { result: true, listeners: { all: false, entities: [washer], domains: [], time: false } };
    house.templates[`{{ is_state('${guest}', 'off') }}`] = { result: true, listeners: { all: false, entities: [guest], domains: [], time: false } };

    if (k !== 1) continue;

    // Two stored runs of the motion lights: one that ran, one blocked by its condition.
    const traceKey = "automation:kitchen_motion_lights";
    /** @param {string} runId @param {number} at @param {boolean} ran */
    const trace = (runId, at, ran) => {
      const step = (/** @type {string} */ path, /** @type {number} */ dt, /** @type {Record<string, any>} */ result = {}) => [{ path, timestamp: iso(at + dt), result }];
      /** @type {TraceDetail} */
      const detail = {
        run_id: runId, state: "stopped", script_execution: ran ? "finished" : "failed_conditions", trigger: `state of ${kMotion}`,
        last_step: ran ? "action/0/choose/0/sequence/0" : "condition/0/entity_id/0",
        timestamp: { start: iso(at), finish: iso(at + 40) }, domain: "automation", item_id: "kitchen_motion_lights",
        context: ctx(), config: /** @type {Config} */ (house.configs[motionLights]),
        trace: ran ? {
          "trigger/0": step("trigger/0", 0),
          "condition/0": step("condition/0", 2, { result: true }),
          "condition/0/entity_id/0": step("condition/0/entity_id/0", 2, { result: true, state: "off", wanted_state: "off" }),
          "action/0": step("action/0", 5, { choice: 0 }),
          "action/0/choose/0": step("action/0/choose/0", 6, { result: true }),
          "action/0/choose/0/conditions/0": step("action/0/choose/0/conditions/0", 6, { result: true }),
          "action/0/choose/0/sequence/0": step("action/0/choose/0/sequence/0", 9, { params: { domain: "light", service: "turn_on" } }),
        } : {
          "trigger/0": step("trigger/0", 0),
          "condition/0": step("condition/0", 2, { result: false }),
          "condition/0/entity_id/0": step("condition/0/entity_id/0", 2, { result: false, state: "on", wanted_state: "off" }),
        },
      };
      const { trace: _t, config: _c, context: _x, ...summary } = detail;
      house.traces[traceKey] ||= { list: [], runs: {} };
      house.traces[traceKey].list.push(summary);
      house.traces[traceKey].runs[runId] = detail;
    };
    trace("run0001", now - 2 * hour, false);
    trace("run0002", now - 12 * min, true);

    // A day of history for the things that change, and the logbook that goes with it.
    const rand = rng(42);
    const day = now - 24 * hour;
    for (const [eid, on, off] of /** @type {[string, string, string][]} */ ([[kMotion, "on", "off"], [hMotion, "on", "off"], [kCeiling, "on", "off"], [hallLight, "on", "off"], [lamp, "on", "off"], [tv, "playing", "idle"], [door, "on", "off"]])) {
      /** @type {HistoryRow[]} */
      const rows = [{ s: off, lu: day / 1000 }];
      for (let t = day + rand() * hour; t < now - 5 * min; t += (20 + rand() * 90) * min) {
        rows.push({ s: on, lu: t / 1000 }, { s: off, lu: (t + (2 + rand() * 15) * min) / 1000 });
        house.logbook.push({ when: t / 1000, entity_id: eid, state: on });
        if (eid === kMotion) {
          house.logbook.push({ when: t / 1000 + 0.2, entity_id: motionLights, name: "[Kitchen] Lights on with motion", message: `triggered by state of ${kMotion}`, source: `state of ${kMotion}` });
          house.logbook.push({ when: t / 1000 + 0.4, entity_id: kCeiling, state: "on", context_entity_id: motionLights });
        }
      }
      house.history[eid] = rows;
    }
    for (const s of house.states) if (!house.history[s.entity_id]) house.history[s.entity_id] = [{ s: s.state, lu: day / 1000 }];
    house.logbook.sort((a, b) => Number(a.when) - Number(b.when));

    // A minute of live activity: someone walks through the hall into the kitchen.
    /** @param {number} dt @param {string} eid @param {string} to @param {ReturnType<typeof ctx>} [c] */
    const change = (dt, eid, to, c = ctx()) => {
      const old = house.states.find((x) => x.entity_id === eid);
      if (!old) return;
      house.events.push({ t: now + dt, event: { event_type: "state_changed", time_fired: iso(now + dt), context: c,
        data: { entity_id: eid, old_state: old, new_state: { ...old, state: to, last_changed: iso(now + dt), last_updated: iso(now + dt), context: c } } } });
    };
    /** @param {number} dt @param {string} eid @param {string} source */
    const run = (dt, eid, source) => {
      const c = ctx();
      house.events.push({ t: now + dt, event: { event_type: "automation_triggered", time_fired: iso(now + dt), context: c, data: { entity_id: eid, name: eid, source } } });
      return c;
    };
    change(2000, hMotion, "on");
    change(2300, hallLight, "on", run(2100, `automation.hall_light`, `state of ${hMotion}`));
    change(9000, kMotion, "on");
    change(9400, kCeiling, "on", run(9100, motionLights, `state of ${kMotion}`));
    change(30000, hMotion, "off");
    change(42000, door, "on");
    run(42100, `automation.front_door`, `state of ${door}`);
    change(48000, door, "off");
  }
  return house;
}
