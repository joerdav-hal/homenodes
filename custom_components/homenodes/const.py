"""Constants for HomeNodes."""

from __future__ import annotations

from pathlib import Path
from typing import Final

DOMAIN: Final = "homenodes"

PANEL_URL: Final = "homenodes"
PANEL_TITLE: Final = "HomeNodes"
PANEL_ICON: Final = "mdi:graph-outline"
ELEMENT: Final = "homenodes-panel"
# Not under /homenodes/: the frontend answers every path below a panel's URL with its index page.
STATIC_URL: Final = "/homenodes_files"
FRONTEND_DIR: Final = Path(__file__).parent / "frontend"

CONF_CONTROLS: Final = "controls"
CONF_GROUPING: Final = "default_grouping"
CONF_HEAT_DAYS: Final = "heat_days"
CONF_HIDDEN_LABELS: Final = "hidden_labels"

GROUPINGS: Final = ("area", "label", "category", "tag")
HEAT_DAYS_MIN: Final = 1
HEAT_DAYS_MAX: Final = 30

DEFAULTS: Final = {
    CONF_CONTROLS: False,
    CONF_GROUPING: "area",
    CONF_HEAT_DAYS: 7,
    CONF_HIDDEN_LABELS: [],
}
