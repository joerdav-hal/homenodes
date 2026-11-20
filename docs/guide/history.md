# History and activity heat

## History

**History** turns the map into a playback of the recent past. Every state, run and spark is
replayed as it happened.

![History mode, with a mark for each run along the bottom](../images/history.png)

- **How far back**: the last hour, 6 hours, 24 hours or 3 days.
- **Playback speed**: from a minute to two hours a second.
- **Play** and **Pause**, or drag along the strip. Each mark on it is an automation run.
- **Back to live** returns to now.

History comes from Home Assistant's recorder, and the causes of runs from its logbook. Without the
logbook, runs are worked out from the automations' own history; the count is approximate (shown
with ≈) and runs aren't linked to what caused them.

## Activity heat

**View → Activity heat** marks each automation with how often it ran, as runs a day and a bar
along the bottom of its card, over the [heat window](../options.md#activity-heat-window): a week
unless the options say otherwise. Automations that didn't run fade back.

![Activity heat](../images/heat.png)

Use it to find the automations that run far more than you expected, and the ones that never run
at all. Without the logbook, counts are approximate.
