# Contributing

Thanks for helping. A few rules keep HomeNodes small, safe and easy to review.

## Ground rules

- **No dependencies and no build step.** The frontend is plain ES modules that the browser
  loads as they are. If a change needs a package, open an issue first.
- **Types in JSDoc.** Every module except `homenodes-panel.js` is checked under TypeScript's
  strict mode; new code should be too. Shared Home Assistant shapes live in
  [`types/ha.d.ts`](types/ha.d.ts).
- **Text as text.** Build DOM with `h()` and SVG with `s()` from
  [`dom.js`](custom_components/homenodes/frontend/dom.js). `npm run check` rejects HTML
  parsing, string evaluation and network calls.
- **Text goes through `tr()`.** Write interface text as `tr("English text", { placeholder })`
  with a string literal, then run `npm run strings` to update the catalog in
  `translations/en.json`; CI fails if it is stale.
- **Pure logic stays pure.** Graph extraction, conditions, schedules, layout and formatting
  must not touch the DOM, so they can be tested in Node.
- **The integration stays thin.** The Python registers the panel and its options; the panel
  does the work in the browser through Home Assistant's existing commands. Options the panel
  reads are checked again in [`settings.js`](custom_components/homenodes/frontend/settings.js).
- **Fake data only.** Tests and the harness use [`dev/fake-house.js`](dev/fake-house.js).
  Never commit data from a real Home Assistant. If a bug needs a new kind of config to
  reproduce, add it to the fake house.

## Before opening a pull request

```bash
npm run ci              # frontend: check, tests and type check, as CI runs them
nix develop -c pytest   # integration tests (or pip; see the README)
ruff check . && ruff format --check .
```

For anything visible, check it in the dev harness in both themes and at phone width
(`npm run dev`, then `http://127.0.0.1:8770/dev/?wrap`; `?wrap` mimics Home Assistant's panel
container), and include a screenshot.

## Style

Comments explain why, not what, and stay short. Interface text is sentence case and written
for the person using it: "Kitchen presence changed", not
`state of binary_sensor.kitchen_presence`.
