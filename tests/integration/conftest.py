"""Fixtures for the HomeNodes integration tests."""

from collections.abc import Generator

import pytest
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.homenodes.const import DEFAULTS, DOMAIN


@pytest.fixture(autouse=True)
def auto_enable_custom_integrations(enable_custom_integrations: None) -> Generator[None]:
    """Let Home Assistant load custom_components/homenodes."""
    yield


@pytest.fixture
def entry() -> MockConfigEntry:
    """A HomeNodes entry with the default options, not yet added."""
    return MockConfigEntry(domain=DOMAIN, title="HomeNodes", data={}, options=dict(DEFAULTS))
