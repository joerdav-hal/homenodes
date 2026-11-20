# Options

**Settings → Devices & services → HomeNodes → Configure.** Saving reloads the integration; if the
panel is already open somewhere, reload that page to be sure it has the new options.

| Option | Default | |
| --- | --- | --- |
| [Allow controls](#allow-controls) | Off | Buttons and dots that change things. |
| [Group automations by](#group-automations-by) | Area | The grouping until someone picks another. |
| [Activity heat window](#activity-heat-window) | 7 days | How far back activity heat counts runs. |
| [Labels to leave off the map](#labels-to-leave-off-the-map) | None | Automations and scripts to leave out. |

## Allow controls

Off by default, so the map is read-only: panning it on a phone can't switch anything on.

When on, the side panel gets **Run**, **Run actions**, **Enable** and **Disable** for automations,
**Run** for scripts and **Turn on** or **Turn off** for entities, and lights, switches, fans and
toggle helpers get a dot on the map that switches them. Nothing that unlocks, opens or heats can
be switched from the map.

**Run actions** skips the automation's conditions, so it asks first.

<figure markdown>
![With controls off, the side panel offers only Open editor](images/controls-off.png)
<figcaption>Controls off: the side panel shows what an automation does, and links to its editor.</figcaption>
</figure>

## Group automations by

How automations are gathered into zones:

- **Area**: the automation's own area; failing that, an area named in a `[Tag]` at the start of
  its name; failing that, the area most of what it controls is in.
- **Label**: its first label, alphabetically.
- **Category**: its category.
- **[Tag] at the start of the name**: `[Kitchen] Lights on with motion` goes in *Kitchen*.

This sets the default. Each person can pick another from the panel's **View** menu, and each
grouping keeps its own layout.

![Grouped by label](images/grouped-by-label.png)

## Activity heat window

From 1 to 30 days. See [activity heat](guide/history.md#activity-heat).

## Labels to leave off the map

Automations and scripts with any of these labels are not drawn, and their configuration is never
requested, so it never reaches the browser. Use it for automations that are private, or that
would only clutter the map.

If another automation uses a hidden one (to turn it on, say), it appears there as a plain entity.
