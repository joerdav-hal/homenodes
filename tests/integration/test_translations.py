"""Every key the integration shows has English text, so no raw keys reach the UI."""

import json
from pathlib import Path

from custom_components.homenodes.config_flow import OPTIONS_SCHEMA
from custom_components.homenodes.const import GROUPINGS

EN = json.loads((Path(__file__).parents[2] / "custom_components/homenodes/translations/en.json").read_text())


def test_every_option_is_labelled_and_described() -> None:
    step = EN["options"]["step"]["init"]
    keys = {str(key) for key in OPTIONS_SCHEMA.schema}
    assert set(step["data"]) == keys
    assert set(step["data_description"]) == keys


def test_every_grouping_has_a_label() -> None:
    assert set(EN["selector"]["grouping"]["options"]) == set(GROUPINGS)


def test_errors_and_aborts() -> None:
    assert EN["config"]["abort"]["single_instance_allowed"]
    assert "{url}" in EN["exceptions"]["panel_taken"]["message"]
