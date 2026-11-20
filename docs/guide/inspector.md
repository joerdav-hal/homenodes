# Looking closer

Select anything on the map to open it in the side panel. The map rearranges itself around it:
everything unrelated is hidden, and what flows in and out, up to two steps each way, is laid out
in columns either side. Select the background, or press <kbd>Esc</kbd>, to go back.

![An automation in the side panel](../images/focus.png)

## Automations and scripts

At the top, the buttons. **Open editor** is always there; **Run**, **Run actions** and
**Enable** or **Disable** need [Allow controls](../options.md#allow-controls).

- **Run** runs it as if it had been triggered, so its conditions still apply.
- **Run actions** skips the conditions and runs the actions, after asking.

Then the facts:

| | |
| --- | --- |
| Status | Enabled, Disabled or Unavailable; for a script, Running or Idle. |
| Last ran | When, in your Home Assistant profile's time format. |
| Starts on | Its triggers, in words. |
| Mode | Single, restart, queued or parallel. |
| Defined in | **The UI**, or **YAML** for automations from `configuration.yaml`, packages or includes, which the UI can't edit. |
| Blueprint | The blueprint it's made from, if any. |
| Blocked now | What would stop it running right now. |
| Problem | Why its configuration or blueprint can't be read. |

![An automation blocked right now: the sun is up, and it needs after sunset](../images/blocked.png)

## Why it did or didn't run

**Recent runs** lists the runs Home Assistant has kept (the last five, unless the automation sets
`stored_traces` under `trace:`), with what started each and how it ended: *Ran*, *Blocked*, *Error* and
so on.

Select a run to replay it on the map. Each step lights up in turn: the trigger, each condition in
green or red, and each action. The side panel lists the steps in order: conditions with
*Passed* or *Failed* and what the entity was, which option a choose took, errors, and for the rest
how long after the start each happened.

## What it listens to and acts on

**Listens to** lists triggers and conditions with each one's current state, and whether each
condition passes now. **Acts on** lists everything it changes. Select a row to go to it.

**Configuration** shows the automation as written. For a blueprint automation, **Expanded from
the blueprint** shows what the blueprint turns it into, which is what the map draws.

![A blueprint automation, drawn from its expanded configuration](../images/blueprint.png)

## Entities

Entities show their state, when it changed, their area, and every automation that uses them.
**More info** opens Home Assistant's own dialog and **History** its history page; **Turn on** or
**Turn off** needs controls.

![An entity, with the automations that use it](../images/entity.png)
