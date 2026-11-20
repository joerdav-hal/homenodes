"""Config and options flows for HomeNodes."""

from __future__ import annotations

from typing import Any

from homeassistant.config_entries import ConfigEntry, ConfigFlow, ConfigFlowResult, OptionsFlow
from homeassistant.core import callback
from homeassistant.helpers.selector import (
    BooleanSelector,
    LabelSelector,
    LabelSelectorConfig,
    NumberSelector,
    NumberSelectorConfig,
    NumberSelectorMode,
    SelectSelector,
    SelectSelectorConfig,
    SelectSelectorMode,
)
import voluptuous as vol

from .const import (
    CONF_CONTROLS,
    CONF_GROUPING,
    CONF_HEAT_DAYS,
    CONF_HIDDEN_LABELS,
    DEFAULTS,
    DOMAIN,
    GROUPINGS,
    HEAT_DAYS_MAX,
    HEAT_DAYS_MIN,
    PANEL_TITLE,
)

OPTIONS_SCHEMA = vol.Schema(
    {
        vol.Required(CONF_CONTROLS): BooleanSelector(),
        vol.Required(CONF_GROUPING): SelectSelector(
            SelectSelectorConfig(
                options=list(GROUPINGS),
                translation_key="grouping",
                mode=SelectSelectorMode.DROPDOWN,
            )
        ),
        vol.Required(CONF_HEAT_DAYS): NumberSelector(
            NumberSelectorConfig(
                min=HEAT_DAYS_MIN,
                max=HEAT_DAYS_MAX,
                step=1,
                mode=NumberSelectorMode.BOX,
                unit_of_measurement="days",
            )
        ),
        vol.Optional(CONF_HIDDEN_LABELS): LabelSelector(LabelSelectorConfig(multiple=True)),
    }
)


class HomeNodesConfigFlow(ConfigFlow, domain=DOMAIN):
    """Add HomeNodes. The manifest's single_config_entry stops a second one."""

    VERSION = 1

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        """Confirm, then add the panel with the default options."""
        if user_input is not None:
            return self.async_create_entry(title=PANEL_TITLE, data={}, options=dict(DEFAULTS))
        return self.async_show_form(step_id="user")

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: ConfigEntry) -> OptionsFlow:
        """The panel's options."""
        return HomeNodesOptionsFlow()


class HomeNodesOptionsFlow(OptionsFlow):
    """Controls, the default grouping, the heat window and labels to leave off the map."""

    async def async_step_init(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        """Show the options; saving them reloads the entry, which re-registers the panel."""
        if user_input is not None:
            # A cleared label picker leaves its key out rather than sending an empty list.
            return self.async_create_entry(
                data={
                    **user_input,
                    CONF_HEAT_DAYS: int(user_input[CONF_HEAT_DAYS]),
                    CONF_HIDDEN_LABELS: user_input.get(CONF_HIDDEN_LABELS, []),
                }
            )
        return self.async_show_form(
            step_id="init",
            data_schema=self.add_suggested_values_to_schema(
                OPTIONS_SCHEMA, {**DEFAULTS, **self.config_entry.options}
            ),
        )
