"""Constants for Dashboard Holiday Popups."""
# Integration version: 1.0.4
from __future__ import annotations

DOMAIN = "dashboard_holiday_popups"
VERSION = "1.0.4"

STORAGE_KEY = DOMAIN
STORAGE_VERSION = 1

# URLs. The version is part of every script URL, so a new release always
# loads from a new path. Nothing is ever appended to a URL as a query string.
STATIC_BASE = f"/{DOMAIN}_static/{VERSION}"
RUNTIME_JS_URL = f"{STATIC_BASE}/dashboard-holiday-popups.js"
PANEL_JS_URL = f"{STATIC_BASE}/panel.js"
BUILTIN_URL = f"{STATIC_BASE}/defaults"
FILES_URL = f"/{DOMAIN}_files"
UPLOAD_URL = f"/api/{DOMAIN}/upload"

PANEL_URL_PATH = "dashboard-holiday-popups"
PANEL_ELEMENT = "dashboard-holiday-popups-panel"

# Uploads
MAX_UPLOAD_BYTES = 5 * 1024 * 1024
ALLOWED_EXTENSIONS = {".gif", ".webp", ".png", ".apng"}
CLEANUP_GRACE_SECONDS = 600

# Choices (shared by validation and the panel)
KINDS = ("floater", "popup", "decoration")
PATHS = ("bottom_straight", "top_straight", "free_float", "curve_arc")
DIRECTIONS = ("both", "left_to_right", "right_to_left")
MOTIONS = ("drift", "bob_vertical", "sway_horizontal", "circle")
WAVE_SHAPES = ("sine", "zigzag")
EDGES = ("bottom", "top", "left", "right")
POPUP_ANCHORS = ("bottom", "top", "left", "right", "left_right", "top_bottom", "random")
NINE_ANCHORS = (
    "top_left",
    "top",
    "top_right",
    "left",
    "center",
    "right",
    "bottom_left",
    "bottom",
    "bottom_right",
)
REPEAT_MODES = ("repeat", "once")
TRIGGER_TYPES = ("always", "date", "weather", "entity", "manual")
OPERATORS = ("equals", "not_equals", "above", "below", "contains")
WEATHER_CONDITIONS = (
    "clear-night",
    "cloudy",
    "exceptional",
    "fog",
    "hail",
    "lightning",
    "lightning-rainy",
    "partlycloudy",
    "pouring",
    "rainy",
    "snowy",
    "snowy-rainy",
    "sunny",
    "windy",
    "windy-variant",
)

# Websocket / events
EVENT_COMMAND = f"{DOMAIN}_command"
