# Health and Up next

## Health

**Health** checks every automation and script at once. The number on the button counts problems;
notes aren't counted.

![Health](../images/health.png)

| Check | |
| --- | --- |
| Broken references | Something used by an automation doesn't exist: renamed, removed, or a typo. |
| Automations that can't load | Home Assistant couldn't set it up, or its configuration can't be read. |
| Blueprints that can't be read | The blueprint file is missing or invalid. |
| Waiting on something unavailable | A trigger or condition depends on something that's unavailable now. |
| Possible duplicates | Two automations act on the same things, started by the same things. |
| Fighting in the last day | Two automations switched the same thing in opposite directions within a minute of each other. Needs the logbook. |
| Disabled | Automations that are turned off. A note. |
| Not run in 30 days | Including those that have never run. A note. |
| Template conditions not checked live | More than 50 template conditions are in use; the rest aren't checked live, to spare Home Assistant. A note. |

Select any item to go to it on the map.

## Up next

**Up next** lists what is scheduled to run in the next 12 hours: times, sunrise and sunset
offsets, and times set by date-and-time helpers. Repeating schedules are listed separately, with
when each next fires.

![Up next](../images/upnext.png)

Up next shows what *could* run, and says when something gets in the way: a disabled automation is
marked *Disabled, so it won't run*, and one whose conditions would block it right now says why.
