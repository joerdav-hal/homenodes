"""HomeNodes: every automation and script as a live node graph."""

from __future__ import annotations

import hashlib
from typing import Any

from homeassistant.components import frontend, panel_custom
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ConfigEntryError
from homeassistant.loader import async_get_integration

from .const import (
    CONF_CONTROLS,
    CONF_GROUPING,
    CONF_HEAT_DAYS,
    CONF_HIDDEN_LABELS,
    DEFAULTS,
    DOMAIN,
    ELEMENT,
    FRONTEND_DIR,
    GROUPINGS,
    HEAT_DAYS_MAX,
    HEAT_DAYS_MIN,
    PANEL_ICON,
    PANEL_TITLE,
    PANEL_URL,
    STATIC_URL,
)


def frontend_digest() -> str:
    """A short hash of the frontend files: a changed file gets a new address, version bump or not."""
    digest = hashlib.sha256()
    for path in sorted(FRONTEND_DIR.rglob("*")):
        if path.is_file() and "__pycache__" not in path.parts:
            digest.update(str(path.relative_to(FRONTEND_DIR)).encode())
            digest.update(path.read_bytes())
    return digest.hexdigest()[:10]


def panel_config(options: dict[str, Any]) -> dict[str, Any]:
    """The options as the panel reads them, with anything out of range replaced by its default."""
    opts = {**DEFAULTS, **options}
    try:
        days = int(opts[CONF_HEAT_DAYS])
    except (TypeError, ValueError, OverflowError):
        days = DEFAULTS[CONF_HEAT_DAYS]
    labels = opts[CONF_HIDDEN_LABELS] if isinstance(opts[CONF_HIDDEN_LABELS], list) else []
    return {
        CONF_CONTROLS: bool(opts[CONF_CONTROLS]),
        CONF_GROUPING: opts[CONF_GROUPING] if opts[CONF_GROUPING] in GROUPINGS else DEFAULTS[CONF_GROUPING],
        CONF_HEAT_DAYS: min(max(days, HEAT_DAYS_MIN), HEAT_DAYS_MAX),
        CONF_HIDDEN_LABELS: [label for label in labels if isinstance(label, str)],
    }


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Serve the frontend and add the panel."""
    version = str((await async_get_integration(hass, DOMAIN)).version)
    digest = await hass.async_add_executor_job(frontend_digest)
    base = f"{STATIC_URL}/{version}-{digest}"

    # Static routes can't be removed, so register them once per run; the version and digest in the
    # path mean a browser never mixes modules from two builds.
    served: set[str] = hass.data.setdefault(DOMAIN, set())
    if base not in served:
        await hass.http.async_register_static_paths(
            [StaticPathConfig(base, str(FRONTEND_DIR), cache_headers=True)]
        )
        served.add(base)

    try:
        await panel_custom.async_register_panel(
            hass,
            frontend_url_path=PANEL_URL,
            webcomponent_name=ELEMENT,
            sidebar_title=PANEL_TITLE,
            sidebar_icon=PANEL_ICON,
            module_url=f"{base}/homenodes-panel.js",
            require_admin=True,
            config=panel_config(dict(entry.options)),
        )
    except ValueError as err:
        raise ConfigEntryError(
            translation_domain=DOMAIN,
            translation_key="panel_taken",
            translation_placeholders={"url": f"/{PANEL_URL}"},
        ) from err

    entry.async_on_unload(entry.add_update_listener(_options_updated))
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Remove the panel; the static files stay until restart, unreachable from the sidebar."""
    frontend.async_remove_panel(hass, PANEL_URL)
    return True


async def _options_updated(hass: HomeAssistant, entry: ConfigEntry) -> None:
    await hass.config_entries.async_reload(entry.entry_id)
