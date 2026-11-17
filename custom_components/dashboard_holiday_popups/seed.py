# Integration version: 1.0.4
"""Starter items created on first run. All art ships in the defaults folder."""
from __future__ import annotations

from datetime import date
from typing import Any

# Pack windows. Movable holidays use the widest range the day can fall in.
HALLOWEEN = ("Halloween", "10-15", "10-31")
THANKSGIVING = ("Thanksgiving", "11-22", "11-28")  # 4th Thursday always falls on Nov 22-28
CHRISTMAS = ("Christmas", "12-01", "12-26")


def _date(window: tuple[str, str, str] | tuple[str, str]) -> dict[str, Any]:
    """A yearly date trigger from MM-DD (and an optional last MM-DD). 2000 is a leap year."""
    name, start, *end = window
    first = date(2000, int(start[:2]), int(start[3:]))
    last = date(2000, int(end[0][:2]), int(end[0][3:])) if end else first
    return {
        "type": "date",
        "name": name,
        "recurrence": {
            "start": first.isoformat(),
            "length_days": (last - first).days + 1,
            "repeat": "yearly",
        },
    }


def _walk(name, file, window=None, enabled=False, size=230, direction="both", path="bottom_straight", **extra):
    item = {
        "kind": "floater", "name": name, "enabled": enabled, "image": {"file": file, "builtin": True},
        "size_px": size, "path": path, "direction": direction, "speed": 80,
        "triggers": [_date(window)] if window else [],
    }
    item.update(extra)
    return item


def _stay(name, file, window=None, enabled=False, size=230, motion="bob_vertical", anchor="center", **extra):
    item = {
        "kind": "floater", "name": name, "enabled": enabled, "image": {"file": file, "builtin": True},
        "size_px": size, "path": "free_float", "motion": motion, "amplitude_px": 12 if motion == "bob_vertical" else 30,
        "period_seconds": 4, "anchor": anchor, "speed": 40,
        "triggers": [_date(window)] if window else [],
    }
    item.update(extra)
    return item


def _popup(name, file, window=None, enabled=False, size=260, **extra):
    item = {
        "kind": "popup", "name": name, "enabled": enabled, "image": {"file": file, "builtin": True},
        "size_px": size, "anchor": "bottom", "frequency": {"value": 10, "unit": "minutes"},
        "duration_seconds": 6, "triggers": [_date(window)] if window else [],
    }
    item.update(extra)
    return item


def _deco(name, file, window=None, enabled=False, size=280):
    return {
        "kind": "decoration", "name": name, "enabled": enabled, "image": {"file": file, "builtin": True},
        "size_px": size, "placements": [{"anchor": "top_right", "offset_px": {"x": 0, "y": 0}, "flip": True}], "opacity": 1,
        "triggers": [_date(window)] if window else [],
    }


def _entity(name, file, kind, **extra):
    """Paused, no trigger: the user picks the entity in the panel."""
    maker = _popup if kind == "popup" else _walk
    return maker(name, file, **extra)


def _weather(item: dict[str, Any], conditions: list[str]) -> dict[str, Any]:
    item["triggers"] = [{"type": "weather", "name": "", "entity_id": "", "conditions": conditions}]
    return item


def seed_items() -> list[dict[str, Any]]:
    """Raw (unnormalized) starter items, in display order."""
    items: list[dict[str, Any]] = [
        # --- Halloween (on) ---
        _deco("Spooky cobweb", "spooky-cobweb.png", HALLOWEEN, True),
        _deco("Whimsical cobweb", "whimsical-cobweb.png", HALLOWEEN, False),
        _walk("Flying witch", "witch-flying.webp", HALLOWEEN, True, size=230, path="curve_arc", speed=120,
              wave_shape="sine", amplitude_px=90, peaks=2),
        _stay("Scary ghost", "flying-ghost-scary.gif", HALLOWEEN, True, motion="drift", speed=40),
        _stay("Funny ghosts", "flying-ghosts-funny.gif", HALLOWEEN, True, motion="drift", speed=40),
        _walk("Frankenstein walking", "frankie-walking-2.gif", HALLOWEEN, True, size=220),
        _walk("Frankenstein walking 2", "frankie-walking.gif", HALLOWEEN, True),
        _stay("Bats", "walking-bats.gif", HALLOWEEN, True, size=150, motion="drift", speed=60),
        _popup("Frankenstein popup", "frankie-popup.gif", HALLOWEEN, True),
        _popup("Mummy popup", "popup-mummy.webp", HALLOWEEN, True, size=300, anchor="left", drawn_for="left"),
        # --- Thanksgiving (on) ---
        _deco("Autumn pumpkins", "autumn-pumpkin-corner.png", THANKSGIVING, True),
        _walk("Running turkey", "running-turkey.gif", THANKSGIVING, True),
        _popup("Turkey popup", "popup-turkey.gif", THANKSGIVING, True),
        # --- Christmas (on) ---
        _deco("Christmas corner", "corner-xmas.png", CHRISTMAS, True),
        _walk("Flying Santa", "flying-santa.gif", CHRISTMAS, True, size=200, path="curve_arc", speed=120,
              wave_shape="sine", amplitude_px=90, peaks=2),
        _popup("Santa popup", "popup-santa.gif", CHRISTMAS, True),
        # --- Birthday (user enters the dates) ---
        _walk("Birthday cake walking", "birthday-cake-walking.gif"),
        _popup("Birthday boy popup", "birthday-boy-popup.webp"),
        _popup("Birthday girl popup", "birthday-girl-popup.gif"),
        _popup("Birthday kids popup", "birthday-kids-popup.gif"),
        # --- Easter / spring ---
        _walk("Bouncing Easter bunny", "bouncing-easter-bunny.gif"),
        _walk("Hopping Easter bunny", "hopping-easter-bunny.gif"),
        _popup("Easter bunny popup", "popup-easter-bunny.gif"),
        # --- Other holidays ---
        _walk("Groundhog walking", "walking-groundhog.gif", ("Groundhog Day", "02-02")),
        _popup("Groundhog popup", "popup-groundhog.gif", ("Groundhog Day", "02-02")),
        _walk("Flying cupid", "flying-cupid.gif", ("Valentine's Day", "02-14"), path="curve_arc", speed=100,
              wave_shape="sine", amplitude_px=90, peaks=2),
        _popup("Cupid popup", "popup-cupid.gif", ("Valentine's Day", "02-14")),
        _walk("New Year's walking", "walking-newyears.gif", ("New Year's", "01-01")),
        _stay("Fireworks", "fireworks.gif", ("New Year's", "01-01"), motion="drift", speed=30),
        _popup("Mother's Day popup", "popup-mothers-day.gif", ("Mother's Day", "05-08", "05-14")),  # 2nd Sunday of May
        _stay("Father's Day banner", "floating-fathers-day.gif", ("Father's Day", "06-15", "06-21")),  # 3rd Sunday of June
        _popup("Father's Day popup", "popup-fathers-day.webp", ("Father's Day", "06-15", "06-21")),
        _walk("Uncle Sam walking", "walking-uncle-sam.webp", ("Fourth of July", "07-04")),
        _popup("Uncle Sam popup", "popup-uncle-sam.webp", ("Fourth of July", "07-04")),
        _walk("Labor Day banner", "moving-labor-day.gif", ("Labor Day", "09-01", "09-07"),  # 1st Monday of September
              size=230, direction="left_to_right"),
        _walk("Veterans soldiers", "walking-soldiers.gif", ("Veterans Day", "11-11")),
        _walk("Veterans soldiers in a line", "walking-soldiers-in-a-line.gif", ("Veterans Day", "11-11")),
        _popup("Soldier popup", "popup-soldier.gif", ("Veterans Day", "11-11")),
        _walk("Graduates walking", "graduates-walking.gif"),
        _popup("Graduates popup", "graduates-popup.gif"),
        # --- Holidays that move: set the dates in the panel ---
        _walk("Eid al-Adha", "eid-al-adha.gif", direction="left_to_right"),
        _stay("Eid al-Fitr", "eid-al-fitr.gif"),
        _stay("Ramadan lantern", "ramadan-lantern.gif", motion="sway_horizontal", anchor="top"),
        _stay("Menorah", "moving-menorah.gif"),
        _stay("Dreidel", "moving-dreidel.gif"),
        _stay("Spinning dreidel", "spinning-dreidel.gif"),
        _stay("Yahrzeit candle", "yartzeit-candle.gif"),
        _stay("Chinese New Year dragon", "chinese-ny-dragon.gif", motion="drift", speed=50),
        _stay("Drums (Vaisakhi)", "drums.gif"),
        _stay("Lotus flower (Vesak)", "lotus-flower.gif"),
        # --- House: pick the entity in the panel ---
        _entity("Washer walking", "walking-washer.gif", "floater", size=220),
        _entity("Washer popup", "washing-machine-popup.gif", "popup"),
        _entity("Mail flying", "mail-flying.gif", "floater", size=150, path="curve_arc", speed=120,
                wave_shape="sine", amplitude_px=80, peaks=2, direction="left_to_right"),
        _entity("Mail walking", "walking-mail-no-text.gif", "floater", size=150),
        _entity("Mail popup", "mail-popup.gif", "popup", size=160),
        _entity("Package delivery", "package-delivery-man.gif", "floater"),
        _entity("Package popup", "package-popup.gif", "popup"),
        # --- Weather: pick the weather entity in the panel ---
        _weather(_walk("Rain umbrella", "walking-rain.webp"), ["rainy", "pouring"]),
        _weather(_walk("Shoveling snow", "shoveling-snow.gif"), ["snowy"]),
        _weather(_walk("Snow blower", "snow-blower.webp"), ["snowy"]),
    ]
    return items
