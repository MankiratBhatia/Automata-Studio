import json
import os
from pathlib import Path

import pytest
from hypothesis import settings

FIXTURE_DIR = Path(__file__).parent / "fixtures"


def fixture_names() -> list[str]:
    return sorted(p.stem for p in FIXTURE_DIR.glob("*.json") if p.stem != "expectations")


@pytest.fixture(scope="session")
def expectations() -> dict[str, dict[str, list[str]]]:
    return json.loads((FIXTURE_DIR / "expectations.json").read_text(encoding="utf-8"))


def load_raw(name: str) -> dict:  # type: ignore[type-arg]
    return json.loads((FIXTURE_DIR / f"{name}.json").read_text(encoding="utf-8"))


# Property tests: a quick default for everyday runs, and a deeper one for before a release.
#   HYPOTHESIS_PROFILE=thorough pytest tests/property
settings.register_profile("default", max_examples=100, deadline=None)
settings.register_profile("thorough", max_examples=500, deadline=None)
settings.load_profile(os.environ.get("HYPOTHESIS_PROFILE", "default"))
