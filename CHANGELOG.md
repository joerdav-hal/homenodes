# Changelog

## Unreleased

- Blueprint automations and scripts are expanded before drawing, so their wires show. A
  blueprint that can't be read, or a Home Assistant older than 2024.7, is reported on the node
  and in Health.
- Group automations by area (the new default), label, category or a `[Tag]` in the name, from
  the View menu. Each grouping keeps its own layout.
- Conditions and schedules follow Home Assistant's time zone, and times are shown in the
  user's language, 12- or 24-hour clock and chosen time zone.
- "Defined in" says YAML or UI, asked of Home Assistant's own editor API.
- Moved out of a homelab repository into its own project, as ES modules with JSDoc types,
  tests, a made-up house for development, and CI. Behaviour is unchanged: the old file and
  the new modules render identical output for the same house.
- The panel's custom element is now `homenodes-panel`, and layouts are saved under
  `homenodes`. A layout saved under the old `automap` key is picked up once.
