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

- [x] **Blueprints.** Blueprint automations and scripts are expanded with
  `blueprint/substitute` (Home Assistant 2024.7, core #119890) before drawing; older versions,
  and blueprints that can't be loaded, are reported on the node and in Health.
- [x] **Grouping.** A View menu choice: area (the default: the automation's area, then a `[Tag]`
  naming an area, then where its targets are), label, category, or name tag. Each grouping
  keeps its own saved layout; layouts from before this keep the name-tag grouping.
- [x] **Time zone and locale.** Conditions and schedules run on Home Assistant's time zone.
  Times are shown in the user's language, 12 or 24 hours, and server or browser time, as their
  profile asks.
- [x] **"Defined in".** YAML or UI, from whether Home Assistant's editor API knows the
  automation, replacing the Nix-specific guess.
- [x] **Strings** through `tr()`, gettext style, with the catalog in `translations/en.json`
  generated and checked in CI. English only so far; output proven byte-identical across 17 views.
- [x] Fake-house cases: blueprint automations and scripts, a missing blueprint, YAML packages,
  script fields, labels and categories.
- [ ] Automations an integration created, if any exist in the wild.

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
