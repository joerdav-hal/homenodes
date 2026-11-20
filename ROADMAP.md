# Roadmap

HomeNodes started as one homelab's automation map. These phases turn it into an integration
anyone can install from HACS.

## 1. Own repo, with no change in behaviour (done)

- [x] Split the single 2,578-line file into ES modules, typed with JSDoc.
- [x] Strict type checking for the pure modules; the panel class under looser rules.
- [x] A made-up house for the harness and tests, replacing captured real data.
- [x] Unit tests for graph extraction, conditions, schedules, layout and formatting.
- [x] CI: forbidden-API check, tests and type check.
- [x] Parity: the old file and the new modules render byte-identical shadow DOM for the same
  house, across the overview, focused nodes, Health, Up next, collapsed areas and heat.

Debt carried forward:

- [ ] Split `homenodes-panel.js` (about 1,600 lines) into modules for the map, the inspector,
  history, trace replay and Health.
- [ ] Bring it under `tsconfig.json`'s strict rules and delete `tsconfig.panel.json`.

## 2. Remove one homelab's assumptions

- [ ] **Blueprints.** `automation/config` returns `use_blueprint` and its inputs, so blueprint
  automations currently draw no wires. Expand them first (Home Assistant has a
  `blueprint/substitute` command; confirm the minimum version).
- [ ] **Grouping.** Today automations are grouped by a `[Tag]` at the start of their name.
  Use the automation's area, then labels, then categories, then the tag, then the area most
  of its targets are in. Make it a setting.
- [ ] **Time zone and locale.** Conditions and schedules use the browser's time zone and
  locale. Use Home Assistant's time zone, the user's "server time" profile setting, and their
  language and 12/24-hour preference.
- [ ] **"Defined in".** Replace the Nix-specific detection (`nix_` ids and "Managed in Nix"
  descriptions) with YAML or UI.
- [ ] **Strings** into a translation table, English first.
- [ ] Fake-house cases for every awkward config: packages, `!input`, script fields, and
  automations an integration created.

## 3. The integration

- [ ] `custom_components/homenodes`: config flow, single instance, `hacs.json` with a minimum
  Home Assistant version.
- [ ] Serve the frontend from a versioned path (`/homenodes/<version>/`), so relative imports
  are cache-busted too, and register an admin-only panel; remove it cleanly on unload.
- [ ] Options: sidebar title and icon, grouping, controls, condition status, heat window,
  labels to hide.
- [ ] Diagnostics with personal details redacted.
- [ ] Tests with `pytest-homeassistant-custom-component`.

## 4. Safety

- [ ] A read-only option, a confirmation before "Run actions", and toggling kept to an
  allowlist of domains.
- [ ] Cap live template subscriptions and drop them while the panel is hidden.
- [ ] Bounded, cancellable history and logbook queries.
- [ ] A versioned format for saved layouts that tolerates bad data.
- [ ] Tests with hostile names: markup, right-to-left text, very long strings.

## 5. Scale

- [ ] Performance budgets at 50, 500 and 2,000 automations (`?copies=` in the harness).
- [ ] Tokenise templates instead of searching for every known entity in each one.
- [ ] Batch repaints to animation frames, and skip what is off screen.

## 6. Releases

- [ ] `hassfest` and HACS validation in CI, screenshot tests, a weekly run against Home
  Assistant beta.
- [ ] Tagged releases with notes and provenance.

## 7. Docs and accessibility

- [ ] A README with a demo, settings, troubleshooting and limitations.
- [ ] Keyboard navigation between nodes, and a list view for screen readers.

## 8. Rollout

- [ ] A beta through HACS as a custom repository.
- [ ] The HACS default list, with an icon in `home-assistant/brands`.
