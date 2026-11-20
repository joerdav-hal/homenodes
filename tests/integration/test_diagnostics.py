"""Diagnostics carry counts and versions, never names."""

import json

from homeassistant.const import __version__ as HA_VERSION
from homeassistant.core import HomeAssistant
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.homenodes.const import DEFAULTS, DOMAIN
from custom_components.homenodes.diagnostics import async_get_config_entry_diagnostics


async def test_diagnostics(hass: HomeAssistant) -> None:
    entry = MockConfigEntry(domain=DOMAIN, data={}, options={**DEFAULTS, "hidden_labels": ["secret_garage"]})
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    hass.states.async_set("automation.porch_light_at_dusk", "on", {"friendly_name": "Porch light at dusk"})
    hass.states.async_set("script.goodnight", "off")

    diag = await async_get_config_entry_diagnostics(hass, entry)

    assert diag["version"] == "0.1.0"
    assert diag["home_assistant"] == HA_VERSION
    assert diag["panel_registered"] is True
    assert diag["automations"] == 1
    assert diag["scripts"] == 1
    assert diag["options"]["hidden_labels"] == 1
    assert diag["components"]["logbook"] is False
    text = json.dumps(diag)
    for private in ("secret_garage", "porch", "Porch", "goodnight"):
        assert private not in text
