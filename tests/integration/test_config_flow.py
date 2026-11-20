"""Adding HomeNodes and changing its options."""

from homeassistant import config_entries
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResultType, InvalidData
import pytest
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.homenodes.const import DEFAULTS, DOMAIN


async def test_user_flow_adds_entry_with_defaults(hass: HomeAssistant) -> None:
    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": config_entries.SOURCE_USER})
    assert result["type"] is FlowResultType.FORM
    assert result["step_id"] == "user"

    result = await hass.config_entries.flow.async_configure(result["flow_id"], {})
    await hass.async_block_till_done()
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert result["title"] == "HomeNodes"
    assert result["data"] == {}
    assert result["options"] == DEFAULTS


async def test_only_one_entry(hass: HomeAssistant, entry: MockConfigEntry) -> None:
    entry.add_to_hass(hass)
    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": config_entries.SOURCE_USER})
    assert result["type"] is FlowResultType.ABORT
    assert result["reason"] == "single_instance_allowed"


async def test_options_flow(hass: HomeAssistant, entry: MockConfigEntry) -> None:
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()

    result = await hass.config_entries.options.async_init(entry.entry_id)
    assert result["type"] is FlowResultType.FORM
    assert result["step_id"] == "init"
    # The form starts from the current options.
    suggested = {str(key): key.description["suggested_value"] for key in result["data_schema"].schema}
    assert suggested["heat_days"] == 7
    assert suggested["controls"] is False

    # Number selectors send floats, and a cleared label picker sends nothing.
    result = await hass.config_entries.options.async_configure(
        result["flow_id"], {"controls": True, "default_grouping": "label", "heat_days": 14.0}
    )
    await hass.async_block_till_done()
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert entry.options == {
        "controls": True,
        "default_grouping": "label",
        "heat_days": 14,
        "hidden_labels": [],
    }


async def test_options_flow_rejects_out_of_range(hass: HomeAssistant, entry: MockConfigEntry) -> None:
    entry.add_to_hass(hass)
    result = await hass.config_entries.options.async_init(entry.entry_id)
    with pytest.raises(InvalidData):
        await hass.config_entries.options.async_configure(
            result["flow_id"], {"controls": True, "default_grouping": "colour", "heat_days": 7}
        )
    with pytest.raises(InvalidData):
        await hass.config_entries.options.async_configure(
            result["flow_id"], {"controls": True, "default_grouping": "area", "heat_days": 90}
        )
