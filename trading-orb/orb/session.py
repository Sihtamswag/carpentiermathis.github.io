"""Default session-open reference per asset class.

The Opening Range Breakout resets every session, so each asset class needs
a reference "open" time. Override these per symbol in config.yaml if your
instrument trades a different session (e.g. a specific futures product's
RTH, or a different FX session than London).
"""

SESSION_OPEN_DEFAULTS = {
    "us_equity": {"time": "09:30", "tz": "America/New_York"},
    "us_futures": {"time": "09:30", "tz": "America/New_York"},
    "forex": {"time": "08:00", "tz": "Europe/London"},
}
