// Values shared between the graph, the layout and the panel.

/** Where each user's layout is saved with frontend/set_user_data. */
export const STORE_KEY = "homenodes";
/** The key used before the project had a name, read once so layouts carry over. */
export const LEGACY_STORE_KEY = "automap";

/** States that count as "on" for drawing current along a wire. */
export const ACTIVE = new Set(["on", "home", "open", "playing", "active", "detected", "heat", "heating", "cool", "unlocked", "Running"]);

/** @type {Record<"condition" | "action" | "trigger", number>} */
export const ROLE_RANK = { condition: 0, action: 1, trigger: 2 };

/** Width and height of each kind of node, in map units. @type {Record<string, [number, number]>} */
export const SIZE = { automation: [236, 56], script: [236, 56], entity: [204, 40], service: [196, 40], virtual: [196, 40], device: [196, 40], time: [156, 40], group: [264, 64] };

// Domains whose dot toggles them; nothing that unlocks, opens or heats.
export const TOGGLEABLE = new Set(["light", "switch", "input_boolean", "fan"]);

/** How a trace's script_execution reads, and the class it is shown in. @type {Record<string, [string, string]>} */
export const OUTCOME = {
  finished: ["Ran", "ok"], failed_conditions: ["Blocked", "warn"], error: ["Error", "no"], failed_single: ["Already running", ""],
  cancelled: ["Cancelled", ""], aborted: ["Stopped", ""], failed_max_runs: ["Too many runs", "no"], running: ["Running", "ok"],
};
