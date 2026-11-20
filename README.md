# HomeNodes

Every Home Assistant automation and script, drawn as a live node graph. Triggers and
conditions run into each automation, its actions run out, and when something happens you see
it travel along the wires: a sensor changes, its automation lights up, the lights it turns on
light up after it.

> **Status: pre-release.** HomeNodes is being turned from a personal panel into an
> integration anyone can install from HACS. It is not published yet; see
> [ROADMAP.md](ROADMAP.md).

## Installing

HomeNodes needs Home Assistant 2024.12 or later.

1. Copy `custom_components/homenodes` into your Home Assistant's `custom_components` folder
   (through HACS as a custom repository, once it is published), then restart.
2. **Settings → Devices & services → Add integration → HomeNodes.**
3. Open **HomeNodes** in the sidebar. Only administrators see it.

To rename the panel, change its icon or hide it, edit the sidebar as you would for any panel.

### Options

From the integration's **Configure** button:

| Option | Default | What it does |
| --- | --- | --- |
| Allow controls | Off | Buttons to run, enable and disable automations and scripts, and dots on the map that switch lights, switches, fans and toggle helpers. |
| Group automations by | Area | The grouping used until someone picks another from the panel's View menu. |
| Activity heat window | 7 days | How far back activity heat counts runs. |
| Labels to leave off the map | None | Automations and scripts with any of these labels are not drawn, and their configuration is never read. |

Positions, the chosen grouping and View settings are saved per user in Home Assistant.

## What it shows

- **Every automation and script**, including ones made from blueprints, with the entities,
  devices, schedules and services they use. They're grouped into zones by area, label,
  category or a `[Tag]` in the name.
- **Live state**: wires from anything that's on carry current, and each run sparks along the
  trigger that fired it and on to everything it changed.
- **Why it did or didn't run**: conditions are checked live, and stored runs can be replayed on
  the map step by step.
- **History**: scrub or play back the last hours or days.
- **Health**: broken references, unreadable automations, duplicates and automations fighting
  over the same thing.
- **Up next**: what is scheduled to run in the next 12 hours.

## Privacy and security

- Everything stays on your Home Assistant. HomeNodes makes no outside requests, loads nothing
  from a CDN and has no runtime dependencies; [`scripts/check.mjs`](scripts/check.mjs) fails
  the build if that ever changes.
- It is an admin-only panel. It uses only Home Assistant's own WebSocket commands, and the ones
  that show how automations work are restricted to administrators by Home Assistant itself.
- It changes nothing unless you turn on **Allow controls**.
- Names and other text are always rendered as text, never parsed as HTML.
- The code in this repo is exactly what runs: there is no build step or bundler.

See [SECURITY.md](SECURITY.md) to report a problem.

## Development

The frontend is plain ES modules in
[`custom_components/homenodes/frontend`](custom_components/homenodes/frontend), typed with
JSDoc and checked by TypeScript without compiling anything. You need Node 20 or later; there
is nothing to install.

```bash
npm run dev        # serve the repo, then open http://127.0.0.1:8770/dev/
npm test           # unit tests, with Node's own test runner
npm run typecheck  # TypeScript 5.9 over the JSDoc types, through npx
npm run check      # forbidden APIs, outside URLs, and a stale translation catalog
npm run strings    # rebuild translations/en.json after changing interface text
```

The dev harness runs the panel against [a made-up house](dev/fake-house.js) with a fake
`hass` object, including traces, a day of history, a logbook and a minute of live activity
to replay. Its query parameters (`?theme=light`, `?select=<entity id>`, `?open=health`,
`?copies=20` and more) are listed at the top of [dev/index.html](dev/index.html).

Option parameters (`?controls=0`, `?grouping=label`, `?heatdays=3`, `?hide=lighting`) stand in
for the integration's options.

Never commit data captured from a real Home Assistant: it holds names and locations.
`dev/private/` is ignored for local experiments.

The integration in [`custom_components/homenodes`](custom_components/homenodes) is tested with
[`pytest-homeassistant-custom-component`](https://github.com/MatthewFlamm/pytest-homeassistant-custom-component),
pinned with the Home Assistant frontend in [`requirements_test.txt`](requirements_test.txt):

```bash
nix develop -c pytest        # with Nix: Node, TypeScript, ruff and the harness, pinned in flake.lock
pip install -r requirements_test.txt ruff==0.17.4 && pytest   # or with pip, on Python 3.14
ruff check . && ruff format --check .
```

## Licence

[MIT](LICENSE)
