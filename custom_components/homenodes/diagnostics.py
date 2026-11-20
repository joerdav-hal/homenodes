"""Diagnostics for HomeNodes: versions, options and counts, with no names in them."""

from __future__ import annotations

from typing import Any

from homeassistant.components import frontend
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import __version__ as HA_VERSION
from homeassistant.core import HomeAssistant
from homeassistant.loader import async_get_integration

from . import panel_config
from .const import CONF_HIDDEN_LABELS, DOMAIN, PANEL_URL

# What the panel reads from, or falls back without.
USED_COMPONENTS = ("automation", "blueprint", "history", "logbook", "recorder", "script", "trace")


async def async_get_config_entry_diagnostics(hass: HomeAssistant, entry: ConfigEntry) -> dict[str, Any]:
    """Return diagnostics for the config entry."""
    options = panel_config(dict(entry.options))
    # Label ids are slugs of the names people gave them, so only their number goes out.
    options[CONF_HIDDEN_LABELS] = len(options[CONF_HIDDEN_LABELS])
    return {
        "version": str((await async_get_integration(hass, DOMAIN)).version),
        "home_assistant": HA_VERSION,
        "options": options,
        "panel_registered": PANEL_URL in hass.data.get(frontend.DATA_PANELS, {}),
        "automations": len(hass.states.async_entity_ids("automation")),
        "scripts": len(hass.states.async_entity_ids("script")),
        "components": {name: name in hass.config.components for name in USED_COMPONENTS},
    }
