# Changelog

## Unreleased

- Much faster on large installs: at 2,000 automations a state change costs a quarter of what it
  did, loading half, and graph building a fifth. Off-screen parts of the map are skipped until
  you pan to them.
- Zoomed far out, only wires carrying current or a run are drawn, so a large map reads as
  activity rather than a hairball.

- "Run actions" asks first, since it skips the conditions.
- Live template conditions are capped at 50, limited to 3 seconds of rendering each, and
  dropped while the browser tab is in the background. Those over the cap are listed in Health.
- History, activity heat, fights and run replays give up after a time limit and say why,
  instead of loading forever; switching ranges quickly no longer shows an older answer.
- Saved layouts that are damaged or from another version load what is good in them.
- An area named `__proto__` no longer disappears, and an automation variable with symbols in
  its name no longer stops condition checks for every automation.
- Long names wrap in the side panel, and right-to-left names can't reverse surrounding text.

- **An integration.** Add HomeNodes from Settings → Devices & services and it adds an
  admin-only panel, served from a path that changes with each release so browsers never mix
  versions. Needs Home Assistant 2024.12.
- Options: allow controls (off by default, so the map is read-only), the default grouping, the
  activity heat window, and labels whose automations and scripts are left off the map and never
  read.
- Diagnostics report versions, options and counts, without names.
- `npm run dev` serves the harness without caching, so an edited module is always the one
  that runs.

- Blueprint automations and scripts are expanded before drawing, so their wires show. A
  blueprint that can't be read, or a Home Assistant older than 2024.7, is reported on the node
  and in Health.
- Group automations by area (the new default), label, category or a `[Tag]` in the name, from
  the View menu. Each grouping keeps its own layout.
- Conditions and schedules follow Home Assistant's time zone, and times are shown in the
  user's language, 12- or 24-hour clock and chosen time zone.
- "Defined in" says YAML or UI, asked of Home Assistant's own editor API.
- All interface text goes through a translation table, with a catalog in
  `translations/en.json`. English is the only language so far.
- Moved out of a homelab repository into its own project, as ES modules with JSDoc types,
  tests, a made-up house for development, and CI. Behaviour is unchanged: the old file and
  the new modules render identical output for the same house.
- The panel's custom element is now `homenodes-panel`, and layouts are saved under
  `homenodes`. A layout saved under the old `automap` key is picked up once.
