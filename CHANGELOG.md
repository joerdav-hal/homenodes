# Changelog

## 0.1.0 (2026-11-20)

The first public release, a beta.

- **The map.** Every automation and script, with the entities, devices, schedules and services
  they listen to and act on, grouped into zones by area, label, category or a `[Tag]` in the
  name. Blueprint automations are expanded so their wires show. Drag, collapse, search, and
  zoom out to see only what's live.
- **Live.** Wires from anything that's on carry current, and each run sparks from its trigger
  through the automation to everything it changes.
- **Why it did or didn't run.** Conditions are checked live and say what's blocking; stored
  runs replay on the map step by step.
- **History and activity heat.** Play back the last hour to three days; see how often each
  automation runs.
- **Health.** Broken references, automations and blueprints that can't load, things waiting on
  something unavailable, possible duplicates, automations fighting over the same thing, and
  ones that haven't run in 30 days.
- **Up next.** What's scheduled in the next 12 hours.
- **The integration.** Added from Settings → Devices & services as an admin-only panel. Options:
  allow controls (off by default), default grouping, activity heat window, and labels to leave
  off the map. Diagnostics carry counts and versions, never names.
- **Safe and light.** Read-only unless controls are allowed, and "Run actions" asks first. No
  outside requests, no dependencies, names always rendered as text. Live template checks are
  capped and paused in background tabs, queries time out, and it stays responsive at 2,000
  automations.
- Follows Home Assistant's time zone and each person's language and time format settings.
  English only so far.
