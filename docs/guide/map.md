# Reading the map

![The map](../images/map.png)

## Nodes

| Node | What it is |
| --- | --- |
| Automation | The larger cards, with what starts them and when they last ran. |
| Script | Like an automation, with *Running* or *Idle*. |
| Entity | Anything an automation listens to or changes, with its state. |
| Device | A device used by a device trigger, condition or action. |
| Schedule | A time, a sunrise or sunset offset, a repeating pattern, or Home Assistant starting, with when it next fires. |
| Service call | An action that targets nothing in particular, such as a notification. |
| Group | `entity_id: all`, or everything of a kind in an area. |

A dashed red outline means something is wrong: an entity that doesn't exist, or an automation
whose configuration can't be read. [Health](health.md) lists them all.

## Wires

Wires run left to right, from what an automation listens to, to what it changes. The **View**
menu has a key.

| Wire | Means |
| --- | --- |
| Amber | **Trigger**: what starts it. |
| Dashed | **Condition**: what it checks. Green if it would pass right now, red if it would block, grey if it can't be known ahead (a template that uses the trigger, say). |
| Blue | **Action**: what it changes. |
| Moving dashes | **Current**: the thing at the start of the wire is on. |

When something changes, a spark runs along its wires. When an automation runs, the spark goes
from the trigger that fired it, through the automation, and on along each action to the thing it
changed, which flashes. Actions with a templated target appear the first time they're seen.

An automation that would be blocked right now says why on its card: *Blocked: Holiday mode is
off, needs on*. Turn this off with **View → Condition status**.

## Activity

The **Activity** list in the corner shows the last few runs as they happen, for a minute and a
half each. Select one to see that run.

## Zones

Automations are gathered into zones by area, label, category or name tag (**View → Group by**),
with the entities they use next to them. Select a zone's title to collapse it into a single card
that counts its automations, what's on and what ran this hour; double-click (or double-tap) the
card to open it again. **⋯ → Collapse every area** and **Expand every area** do them all.

## Moving around

| | Mouse | Touch |
| --- | --- | --- |
| Pan | Drag the background, or scroll with a trackpad | Drag |
| Zoom | Scroll wheel, or <kbd>Ctrl</kbd> and scroll | Pinch |
| Fit everything | <kbd>F</kbd>, or **⋯ → Fit to screen** | **⋯ → Fit to screen** |
| Close the side panel | <kbd>Esc</kbd> | × |

Zoomed out, cards drop their text and show only their state as a colour. Zoomed out further
still, only wires carrying current or a run are drawn: on a large install, that's what is worth
seeing from a distance.

Drag a card to move it. Positions, collapsed zones and View settings are saved for each person,
one layout per grouping. **⋯ → Tidy the layout** lays everything out again.

## Search

Type in the search box to highlight matching automations and entities; <kbd>Enter</kbd> opens the
first match and <kbd>Esc</kbd> clears the search.

## On a phone

The toolbar keeps search, Health, View and **⋯**; Up next and History move into **⋯**. The side
panel becomes a sheet at the bottom.

![On a phone](../images/phone.png){ width="300" }
