# HomeNodes

Every Home Assistant automation and script, drawn as a live node graph. Triggers and conditions
run into each automation, its actions run out, and when something happens you see it travel
along the wires: a sensor changes, its automation lights up, and the lights it turns on light up
after it.

![The map: zones of automations with the entities they listen to and act on](images/map.png)

!!! note "Beta"
    HomeNodes is new. Bugs, rough edges and ideas are welcome in
    [GitHub issues](https://github.com/joerdav/homenodes/issues).

## What it shows

- **Every automation and script**, including ones made from blueprints, with the entities,
  devices, schedules and services they use, grouped into zones by area, label, category or a
  `[Tag]` in the name.
- **Live state.** Wires from anything that's on carry current, and each run sparks along the
  trigger that fired it and on to everything it changed.
- **Why it did or didn't run.** Conditions are checked live, and Home Assistant's stored runs can
  be replayed on the map, step by step.
- **History.** Scrub or play back the last hour, day or three days.
- **Health.** Broken references, automations that can't load, duplicates, and automations
  fighting over the same thing.
- **Up next.** What is scheduled to run in the next 12 hours.

## Built to be trusted

HomeNodes is an admin-only panel that runs in your browser and talks only to your Home
Assistant. It makes no outside requests, has no build step and no dependencies, and changes
nothing unless you turn on controls. See [Privacy and security](privacy.md).

[Install HomeNodes](install.md){ .md-button .md-button--primary }
[Read the guide](guide/map.md){ .md-button }
