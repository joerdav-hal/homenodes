# Troubleshooting

**"Another panel already uses /homenodes".** A `panel_custom` entry in `configuration.yaml` or
another integration has taken the address. Remove it, then reload HomeNodes.

**An automation shows "Can't read its config".** Home Assistant couldn't return its configuration;
it is usually also listed under *Automations that can't load* in [Health](guide/health.md).

**A blueprint automation has no wires.** Blueprints are expanded by Home Assistant 2024.7 and
later; the card and Health say why if the blueprint can't be read.

**History says "≈" and runs have no causes.** The logbook integration isn't enabled.

**Some conditions stay grey.** They use the trigger, a loop or the automation's own variables, so
they can't be known ahead of a run, or more than 50 template conditions are in use.

**Diagnostics.** Settings → Devices & services → HomeNodes → ⋮ → Download diagnostics. They hold
no names, so they're safe to attach to an issue.
