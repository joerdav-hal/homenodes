"""Setting up, serving and removing the panel."""

from homeassistant.components import frontend
from homeassistant.config_entries import ConfigEntryState
from homeassistant.core import HomeAssistant
from homeassistant.loader import async_get_integration
from homeassistant.setup import async_setup_component
from pytest_homeassistant_custom_component.common import MockConfigEntry
from pytest_homeassistant_custom_component.typing import ClientSessionGenerator

from custom_components.homenodes import panel_config
from custom_components.homenodes.const import DOMAIN, PANEL_URL

VERSION = "0.1.0"
MODULE = f"/homenodes_files/{VERSION}/homenodes-panel.js"


def _panel(hass: HomeAssistant) -> frontend.Panel | None:
    return hass.data.get(frontend.DATA_PANELS, {}).get(PANEL_URL)


async def test_setup_registers_admin_panel(hass: HomeAssistant, entry: MockConfigEntry) -> None:
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()

    assert entry.state is ConfigEntryState.LOADED
    panel = _panel(hass)
    assert panel is not None
    assert panel.require_admin is True
    assert panel.component_name == "custom"
    assert panel.sidebar_title == "HomeNodes"
    custom = panel.config.pop("_panel_custom")
    assert custom["name"] == "homenodes-panel"
    assert custom["module_url"] == MODULE
    assert custom["embed_iframe"] is False
    assert panel.config == {
        "controls": False,
        "default_grouping": "area",
        "heat_days": 7,
        "hidden_labels": [],
    }


async def test_serves_the_frontend_and_its_imports(
    hass: HomeAssistant, entry: MockConfigEntry, hass_client: ClientSessionGenerator
) -> None:
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    client = await hass_client()

    resp = await client.get(MODULE)
    assert resp.status == 200
    assert "javascript" in resp.headers["Content-Type"]
    assert 'customElements.define("homenodes-panel"' in await resp.text()
    # Long-cached, which the version in the path makes safe.
    assert "max-age" in resp.headers.get("Cache-Control", "")

    resp = await client.get(f"/homenodes_files/{VERSION}/graph.js")
    assert resp.status == 200
    resp = await client.get(f"/homenodes_files/{VERSION}/translations/en.json")
    assert resp.status == 200


async def test_static_path_stays_outside_the_package(
    hass: HomeAssistant, entry: MockConfigEntry, hass_client: ClientSessionGenerator
) -> None:
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    client = await hass_client()

    for path in ("../manifest.json", "%2e%2e/manifest.json", "../__init__.py"):
        resp = await client.get(f"/homenodes_files/{VERSION}/{path}")
        assert resp.status in (403, 404), path


async def test_unload_removes_panel_and_reload_works(hass: HomeAssistant, entry: MockConfigEntry) -> None:
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()

    assert await hass.config_entries.async_unload(entry.entry_id)
    assert entry.state is ConfigEntryState.NOT_LOADED
    assert _panel(hass) is None

    # The static route is already registered; setting up again must not try to add it twice.
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    assert entry.state is ConfigEntryState.LOADED
    assert _panel(hass) is not None


async def test_changing_options_updates_the_panel(hass: HomeAssistant, entry: MockConfigEntry) -> None:
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()

    hass.config_entries.async_update_entry(
        entry, options={**entry.options, "controls": True, "hidden_labels": ["private"]}
    )
    await hass.async_block_till_done()

    panel = _panel(hass)
    assert panel is not None
    assert panel.config["controls"] is True
    assert panel.config["hidden_labels"] == ["private"]


async def test_panel_url_already_taken(hass: HomeAssistant, entry: MockConfigEntry) -> None:
    assert await async_setup_component(hass, "frontend", {})
    frontend.async_register_built_in_panel(hass, "iframe", "Someone else's", frontend_url_path=PANEL_URL)

    entry.add_to_hass(hass)
    assert not await hass.config_entries.async_setup(entry.entry_id)
    assert entry.state is ConfigEntryState.SETUP_ERROR
    assert "/homenodes" in (entry.reason or "")
    panel = _panel(hass)
    assert panel is not None
    assert panel.sidebar_title == "Someone else's"


def test_panel_config_replaces_bad_values() -> None:
    assert panel_config(
        {"controls": 1, "default_grouping": "colour", "heat_days": "lots", "hidden_labels": "private"}
    ) == {"controls": True, "default_grouping": "area", "heat_days": 7, "hidden_labels": []}
    assert panel_config({"heat_days": 400.0, "hidden_labels": ["a", 3, None]})["heat_days"] == 30
    assert panel_config({"heat_days": 0})["heat_days"] == 1
    assert panel_config({"heat_days": float("inf")})["heat_days"] == 7
    assert panel_config({"hidden_labels": ["a", 3, None]})["hidden_labels"] == ["a"]
    assert panel_config({}) == panel_config({"unknown": "ignored"})


async def test_domain_constant_matches_manifest(hass: HomeAssistant) -> None:
    integration = await async_get_integration(hass, DOMAIN)
    assert str(integration.version) == VERSION
    assert integration.domain == DOMAIN
