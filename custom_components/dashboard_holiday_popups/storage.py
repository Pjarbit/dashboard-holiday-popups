"""Persistent store for items and settings, plus validation."""
# Integration version: 1.0.8
from __future__ import annotations

from collections.abc import Callable
import logging
import re
from datetime import date, timedelta
from typing import Any
import uuid

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .const import (
    BUILTIN_URL,
    DIRECTIONS,
    EDGES,
    FILES_URL,
    KINDS,
    MOTIONS,
    NINE_ANCHORS,
    OPERATORS,
    PATHS,
    POPUP_ANCHORS,
    REPEAT_MODES,
    STORAGE_KEY,
    STORAGE_VERSION,
    TRIGGER_TYPES,
    WAVE_SHAPES,
    WEATHER_CONDITIONS,
)
from .recurrence import legacy_to_recurrence, normalize_recurrence

_LOGGER = logging.getLogger(__name__)

_COLOR_RE = re.compile(r"^(#[0-9a-fA-F]{3,8}|rgba?\([0-9., %]+\)|[a-zA-Z]{3,20})$")
_FILE_RE = re.compile(r"^[a-z0-9][a-z0-9._-]{0,120}$")


def _num(value: Any, default: float, lo: float, hi: float, integer: bool = False) -> Any:
    """Coerce to a number inside [lo, hi]; fall back to the default."""
    try:
        number = float(value)
    except (TypeError, ValueError):
        number = float(default)
    if number != number:  # NaN
        number = float(default)
    number = max(lo, min(hi, number))
    return int(round(number)) if integer else number


def _str(value: Any, default: str = "", max_len: int = 200) -> str:
    if not isinstance(value, str):
        return default
    return value.strip()[:max_len]


def _bool(value: Any, default: bool = False) -> bool:
    return value if isinstance(value, bool) else default


def _choice(value: Any, options: tuple[str, ...], default: str) -> str:
    return value if value in options else default


def _color(value: Any, default: str) -> str:
    return value if isinstance(value, str) and _COLOR_RE.match(value.strip()) else default


def _paths_list(value: Any) -> list[str]:
    """Dashboard URL prefixes: each must start with a slash."""
    out: list[str] = []
    if isinstance(value, list):
        for entry in value:
            if isinstance(entry, str):
                entry = entry.strip()[:100]
                if entry.startswith("/") and entry not in out:
                    out.append(entry)
    return out[:50]


def default_settings() -> dict[str, Any]:
    return {
        "enabled": True,
        "max_simultaneous": 3,
        "z_index": 900,
        "default_dashboards": [],
        "respect_reduced_motion": True,
        "hide_on_small_screens": False,
        "scale": 100,
        "popup_default_edge": "left",
    }


def normalize_settings(raw: dict[str, Any], current: dict[str, Any] | None = None) -> dict[str, Any]:
    base = {**default_settings(), **(current or {})}
    base.update({k: v for k, v in raw.items() if k in base})
    return {
        "enabled": _bool(base["enabled"], True),
        "max_simultaneous": _num(base["max_simultaneous"], 3, 1, 10, True),
        "z_index": _num(base["z_index"], 900, 1, 100000, True),
        "default_dashboards": _paths_list(base["default_dashboards"]),
        "respect_reduced_motion": _bool(base["respect_reduced_motion"], True),
        # Draw nothing on a narrow screen (a phone held upright).
        "hide_on_small_screens": _bool(base["hide_on_small_screens"], False),
        # Every character, popup and decoration is drawn this many percent of its own size.
        "scale": _num(base["scale"], 100, 25, 400, True),
        # The edge a NEW custom popup peeks in from, and is drawn for. Existing popups keep their own.
        "popup_default_edge": _choice(base["popup_default_edge"], EDGES, "left"),
    }


def normalize_trigger(raw: Any) -> dict[str, Any]:
    """Validate one trigger. Raises ValueError for bad dates."""
    if not isinstance(raw, dict):
        raise ValueError("trigger must be an object")
    ttype = _choice(raw.get("type"), TRIGGER_TYPES, "always")
    trigger: dict[str, Any] = {
        "id": _str(raw.get("id"), "", 40) or uuid.uuid4().hex[:8],
        "type": ttype,
        "enabled": _bool(raw.get("enabled"), True),
        "name": _str(raw.get("name"), "", 60),
    }
    if ttype == "date":
        if isinstance(raw.get("recurrence"), dict):
            trigger["recurrence"] = normalize_recurrence(raw["recurrence"])
        elif raw.get("date"):
            trigger["recurrence"] = legacy_to_recurrence(raw)  # the first-draft date trigger
        else:
            raise ValueError("a date trigger needs a repeat rule")
    elif ttype == "weather":
        conditions = raw.get("conditions")
        trigger.update(
            {
                "entity_id": _str(raw.get("entity_id"), "", 100),
                "conditions": [c for c in conditions if c in WEATHER_CONDITIONS]
                if isinstance(conditions, list)
                else [],
            }
        )
    elif ttype == "entity":
        trigger.update(
            {
                "entity_id": _str(raw.get("entity_id"), "", 100),
                "attribute": _str(raw.get("attribute"), "", 100),
                "operator": _choice(raw.get("operator"), OPERATORS, "equals"),
                "value": _str(raw.get("value"), "", 100),
            }
        )
    return trigger


def _muted_map(raw: Any) -> dict[str, str]:
    if not isinstance(raw, dict):
        return {}
    return {str(k)[:40]: str(v)[:40] for k, v in raw.items() if isinstance(v, str) and v}


MAX_PLACEMENTS = 40


def _placements(raw: dict[str, Any]) -> list[dict[str, Any]]:
    """Where a decoration shows: any number of corners or edges, each with its own offset and flip.

    A decoration saved before placements existed has one position (`anchor`, `offset_px`, `mirror`):
    that becomes its first placement.
    """
    given = raw.get("placements")
    if not isinstance(given, list) or not any(isinstance(p, dict) for p in given):
        given = [{"anchor": raw.get("anchor"), "offset_px": raw.get("offset_px"), "flip": raw.get("mirror")}]
    result = []
    for entry in given[:MAX_PLACEMENTS]:
        if not isinstance(entry, dict):
            continue
        offset = entry.get("offset_px") if isinstance(entry.get("offset_px"), dict) else {}
        result.append(
            {
                "anchor": _choice(entry.get("anchor"), NINE_ANCHORS, "top_right"),
                "offset_px": {
                    "x": _num(offset.get("x"), 0, -2000, 2000, True),
                    "y": _num(offset.get("y"), 0, -2000, 2000, True),
                },
                "flip": _bool(entry.get("flip"), True),
                # empty = use the decoration's own size
                "size_px": None if entry.get("size_px") in (None, "") else _num(entry.get("size_px"), 300, 20, 1600, True),
            }
        )
    return result


def normalize_item(raw: dict[str, Any], existing: dict[str, Any] | None, order: int) -> dict[str, Any]:
    """Validate and complete an item. Raises ValueError on bad input."""
    if not isinstance(raw, dict):
        raise ValueError("item must be an object")
    kind = raw.get("kind") or (existing or {}).get("kind")
    if kind not in KINDS:
        raise ValueError("kind must be floater, popup or decoration")
    name = _str(raw.get("name"), "", 60)
    if not name:
        raise ValueError("name is required")

    image_raw = raw.get("image") if isinstance(raw.get("image"), dict) else {}
    image_file = _str(image_raw.get("file"), "", 130)
    if image_file and not _FILE_RE.match(image_file):
        raise ValueError("invalid image file name")
    triggers_raw = raw.get("triggers") if isinstance(raw.get("triggers"), list) else []
    label_raw = raw.get("label") if isinstance(raw.get("label"), dict) else {}
    z_raw = raw.get("z_index")

    item: dict[str, Any] = {
        "id": (existing or {}).get("id") or uuid.uuid4().hex[:10],
        "order": (existing or {}).get("order", order),
        "kind": kind,
        "name": name,
        "enabled": _bool(raw.get("enabled"), True),
        # Run now: saved here, never taken from the panel's edit form.
        "running": bool((existing or {}).get("running", False)),
        # Set when someone pushes the item away with "turn off" while a scene is deciding for it:
        # {scene id: the occurrence it is muted for}. Saved by async_dismiss only, never from the edit form.
        "muted": _muted_map((existing or {}).get("muted")),
        "image": {"file": image_file, "builtin": _bool(image_raw.get("builtin"), False)},
        "size_px": _num(raw.get("size_px"), 300 if kind == "decoration" else 230, 20, 1600, True),
        "dashboards": _paths_list(raw.get("dashboards")),
        "z_index": None if z_raw in (None, "") else _num(z_raw, 900, 1, 100000, True),
        "triggers": [normalize_trigger(t) for t in triggers_raw[:30]],
        "message_template": _str(raw.get("message_template"), "", 200),
        "label": {
            "enabled": _bool(label_raw.get("enabled"), False),
            "position": _choice(label_raw.get("position"), ("above", "below"), "above"),
            "font_size": _num(label_raw.get("font_size"), 20, 10, 80, True),
            "color": _color(label_raw.get("color"), "#111111"),
            "background": _color(label_raw.get("background"), "#ffffff"),
        },
    }

    drag = raw.get("drag_off") if isinstance(raw.get("drag_off"), dict) else {}
    if kind in ("floater", "popup"):
        item["drag_off"] = {
            # Characters can be pushed aside by default; popups are tap-through until you ask for it.
            "enabled": _bool(drag.get("enabled"), kind == "floater"),
            "action": _choice(drag.get("action"), ("delay", "off"), "delay"),
            "away_seconds": _num(drag.get("away_seconds"), 60, 1, 3600, True),
        }

    if kind == "floater":
        item.update(
            {
                "path": _choice(raw.get("path"), PATHS, "bottom_straight"),
                "speed": _num(raw.get("speed"), 80, 5, 600),
                "direction": _choice(raw.get("direction"), DIRECTIONS, "both"),
                "motion": _choice(raw.get("motion"), MOTIONS, "drift"),
                "wave_shape": _choice(raw.get("wave_shape"), WAVE_SHAPES, "sine"),
                "amplitude_px": _num(raw.get("amplitude_px"), 60, 0, 800),
                "period_seconds": _num(raw.get("period_seconds"), 4, 0.5, 120),
                "peaks": _num(raw.get("peaks"), 2, 1, 10, True),
                "anchor": _choice(raw.get("anchor"), NINE_ANCHORS, "center"),
            }
        )
    elif kind == "popup":
        freq = raw.get("frequency") if isinstance(raw.get("frequency"), dict) else {}
        banner = raw.get("banner") if isinstance(raw.get("banner"), dict) else {}
        edges = raw.get("allowed_edges")
        pos = raw.get("position_along_edge")
        if pos not in ("center", "random"):
            pos = _num(pos, 50, 0, 100)
        item.update(
            {
                "anchor": _choice(raw.get("anchor"), POPUP_ANCHORS, "bottom"),
                # Which edge the picture was drawn for (its body is cut off there). Others rotate from it.
                "drawn_for": _choice(raw.get("drawn_for"), EDGES, "bottom"),
                "allowed_edges": [e for e in edges if e in EDGES] if isinstance(edges, list) and edges else list(EDGES),
                "position_along_edge": pos,
                "frequency": {
                    "value": _num(freq.get("value"), 5, 1, 100000),
                    "unit": _choice(freq.get("unit"), ("seconds", "minutes"), "minutes"),
                },
                "duration_seconds": _num(raw.get("duration_seconds"), 6, 1, 600),
                "rotate_for_edge": _bool(raw.get("rotate_for_edge"), True),
                "repeat_mode": _choice(raw.get("repeat_mode"), REPEAT_MODES, "repeat"),
                "banner": {
                    "enabled": _bool(banner.get("enabled"), False),
                    "text_template": _str(banner.get("text_template"), "", 200),
                },
            }
        )
    else:  # decoration
        item.update({"placements": _placements(raw), "opacity": _num(raw.get("opacity"), 1, 0, 1)})
    return item


def normalize_scene(raw: dict[str, Any], existing: dict[str, Any] | None, order: int) -> dict[str, Any]:
    """Validate a scene: a name, one repeat rule and the items it controls."""
    if not isinstance(raw, dict):
        raise ValueError("scene must be an object")
    name = _str(raw.get("name"), "", 60)
    if not name:
        raise ValueError("name is required")
    ids: list[str] = []
    if isinstance(raw.get("item_ids"), list):
        for entry in raw["item_ids"]:
            if isinstance(entry, str) and entry and entry not in ids:
                ids.append(entry[:40])
    return {
        "id": (existing or {}).get("id") or uuid.uuid4().hex[:10],
        "order": (existing or {}).get("order", order),
        "name": name,
        "enabled": _bool(raw.get("enabled"), True),
        "running": bool((existing or {}).get("running", False)),
        "recurrence": normalize_recurrence(raw.get("recurrence")),
        "item_ids": ids[:200],
        # What {name} becomes in a banner while this scene is showing the item, e.g. "Joe".
        "banner_name": _str(raw.get("banner_name"), "", 40),
    }


def sensor_driven(item: dict[str, Any]) -> bool:
    """Weather and entity items belong on the Sensors screen, never in a scene."""
    return any(t["type"] in ("weather", "entity") for t in item["triggers"])


def builtin_items() -> list[dict[str, Any]]:
    """Items created on first run. Only art that ships with the integration."""
    from .seed import seed_items  # noqa: PLC0415

    return [normalize_item(raw, None, order) for order, raw in enumerate(seed_items(), 1)]


def seed_files() -> list[str]:
    """The picture file of every starter item. It identifies a starter, so one you deleted is not re-added."""
    from .seed import seed_items  # noqa: PLC0415

    return [raw["image"]["file"] for raw in seed_items()]


class PopupStore:
    """Items and settings, saved through the Home Assistant Store helper."""

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass
        self._store: Store[dict[str, Any]] = Store(hass, STORAGE_VERSION, STORAGE_KEY)
        self._data: dict[str, Any] = {"settings": default_settings(), "items": [], "scenes": [], "next_order": 1}
        self._listeners: list[Callable[[dict[str, Any]], None]] = []

    async def async_load(self) -> None:
        stored = await self._store.async_load()
        if stored is None:
            self._data["items"] = builtin_items()
            self._data["seeded"] = seed_files()
            self._data["next_order"] = len(self._data["items"]) + 1
            await self._store.async_save(self._data)
            return
        settings = normalize_settings(stored.get("settings", {}))
        items: list[dict[str, Any]] = []
        for raw in stored.get("items", []):
            try:
                items.append(normalize_item(raw, raw, raw.get("order", len(items) + 1)))
            except ValueError as err:
                _LOGGER.warning("Dropping stored item %s: %s", raw.get("name"), err)
        known = {i["id"] for i in items}
        scenes: list[dict[str, Any]] = []
        for raw in stored.get("scenes", []):
            try:
                scene = normalize_scene(raw, raw, raw.get("order", len(scenes) + 1))
            except ValueError as err:
                _LOGGER.warning("Dropping stored scene %s: %s", raw.get("name"), err)
                continue
            scene["item_ids"] = [i for i in scene["item_ids"] if i in known]
            scenes.append(scene)
        from .seed import ADDED_AFTER_1_0_7, seed_items  # noqa: PLC0415

        seeded = stored.get("seeded")
        migrated = not isinstance(seeded, list)
        if migrated:
            # Saved by 1.0.7 or earlier: treat every starter that existed then as already offered.
            offered = {f for f in seed_files() if f not in ADDED_AFTER_1_0_7}
        else:
            offered = {f for f in seeded if isinstance(f, str)}
        self._data = {
            "settings": settings,
            "items": items,
            "scenes": scenes,
            "seeded": sorted(offered),
            "next_order": max([x["order"] for x in items + scenes], default=0) + 1,
        }
        self._prune_mutes()

        added = False
        for raw in seed_items():
            file = raw["image"]["file"]
            if file in offered:
                continue
            self._data["items"].append(normalize_item(raw, None, self._data["next_order"]))
            self._data["next_order"] += 1
            offered.add(file)
            added = True
        if added or migrated:
            self._data["seeded"] = sorted(offered)
            await self._store.async_save(self._data)

    # -- listeners -------------------------------------------------------

    def add_listener(self, callback: Callable[[dict[str, Any]], None]) -> Callable[[], None]:
        self._listeners.append(callback)

        def _remove() -> None:
            if callback in self._listeners:
                self._listeners.remove(callback)

        return _remove

    def _broadcast(self, payload: dict[str, Any]) -> None:
        for callback in list(self._listeners):
            try:
                callback(payload)
            except Exception:
                _LOGGER.exception("Listener failed")

    def send_command(self, command: dict[str, Any]) -> None:
        """Push a command (test, show, hide_all) to every connected browser."""
        self._broadcast({"type": "command", **command})

    def shutdown(self) -> None:
        """Tell open browsers to remove everything, then drop all listeners."""
        self._broadcast({"type": "shutdown"})
        self._listeners.clear()

    # -- reads -----------------------------------------------------------

    @property
    def settings(self) -> dict[str, Any]:
        return self._data["settings"]

    @property
    def items(self) -> list[dict[str, Any]]:
        return self._data["items"]

    @property
    def scenes(self) -> list[dict[str, Any]]:
        return self._data["scenes"]

    def find_scene(self, scene_id: str) -> dict[str, Any] | None:
        return next((sc for sc in self.scenes if sc["id"] == scene_id), None)

    def scenes_containing(self, item_id: str) -> list[dict[str, Any]]:
        return [sc for sc in self.scenes if item_id in sc["item_ids"]]

    def find_item(self, ref: str) -> dict[str, Any] | None:
        """Find by id first, then by name (case-insensitive)."""
        for item in self.items:
            if item["id"] == ref:
                return item
        lowered = str(ref).strip().lower()
        for item in self.items:
            if item["name"].lower() == lowered:
                return item
        return None

    def referenced_files(self) -> set[str]:
        return {
            item["image"]["file"]
            for item in self.items
            if item["image"]["file"] and not item["image"]["builtin"]
        }

    def config_payload(self) -> dict[str, Any]:
        """What the browsers and the panel receive."""
        items = []
        for item in self.items:
            view = dict(item)
            image = item["image"]
            base = BUILTIN_URL if image["builtin"] else FILES_URL
            view["image_url"] = f"{base}/{image['file']}" if image["file"] else ""
            items.append(view)
        return {"settings": self.settings, "items": items, "scenes": self.scenes}

    # -- writes ----------------------------------------------------------

    async def _async_commit(self) -> None:
        self._prune_mutes()
        await self._store.async_save(self._data)
        self._broadcast({"type": "config", "config": self.config_payload()})

    async def async_save_settings(self, raw: dict[str, Any]) -> dict[str, Any]:
        self._data["settings"] = normalize_settings(raw, self.settings)
        await self._async_commit()
        return self.settings

    async def async_save_item(self, raw: dict[str, Any]) -> dict[str, Any]:
        raw_id = raw.get("id") if isinstance(raw, dict) else None
        existing = next((i for i in self.items if i["id"] == raw_id), None)
        item = normalize_item(raw, existing, self._data["next_order"])
        if existing is not None and sensor_driven(item):
            held = self.scenes_containing(item["id"])
            if held:
                raise ValueError(
                    f"{item['name']} is in the scene {held[0]['name']}. Remove it from the scene before giving it a sensor or weather trigger."
                )
        if existing is None:
            self._data["next_order"] += 1
            self.items.append(item)
        else:
            self.items[self.items.index(existing)] = item
        await self._async_commit()
        return item

    async def async_delete_item(self, item_id: str) -> bool:
        item = self.find_item(item_id)
        if item is None or item["id"] != item_id:
            return False
        self.items.remove(item)
        for scene in self.scenes:
            if item_id in scene["item_ids"]:
                scene["item_ids"].remove(item_id)
        await self._async_commit()
        return True

    async def async_set_item_enabled(self, item_id: str, enabled: bool) -> bool:
        item = self.find_item(item_id)
        if item is None:
            return False
        item["enabled"] = enabled
        await self._async_commit()
        return True

    async def async_disable_all(self, kind: str | None = None, item_ids: list[str] | None = None) -> int:
        """Pause items (all, one kind, or the listed ids). Returns how many were switched off."""
        changed = 0
        for item in self.items:
            if not item["enabled"]:
                continue
            if kind is not None and item["kind"] != kind:
                continue
            if item_ids is not None and item["id"] not in item_ids:
                continue
            item["enabled"] = False
            changed += 1
        if changed:
            await self._async_commit()
        return changed

    async def async_set_running(self, item_id: str, running: bool) -> bool:
        item = self.find_item(item_id)
        if item is None or item["id"] != item_id:
            return False
        item["running"] = running
        await self._async_commit()
        return True

    async def async_set_scene_running(self, scene_id: str, running: bool) -> bool:
        scene = self.find_scene(scene_id)
        if scene is None:
            return False
        scene["running"] = running
        await self._async_commit()
        return True

    async def async_dismiss(self, item_id: str, occurrences: dict[str, str] | None = None) -> bool:
        """Someone pushed a character or popup away and chose "turn off".

        Stops its Run now. An item outside any scene is switched off (like its own switch). An item in scenes is
        muted in each scene that is deciding for it, for the occurrence the browser names (``occurrences`` maps
        scene id to occurrence, "run" for a Run now), so it comes back with the next occurrence.
        """
        item = self.find_item(item_id)
        if item is None or item["id"] != item_id:
            return False
        item["running"] = False
        scenes = self.scenes_containing(item_id)
        if scenes:
            given = occurrences or {}
            for scene in scenes:
                token = given.get(scene["id"])
                if token:
                    item["muted"][scene["id"]] = _str(token, "", 40)
            if not any(sc["id"] in given for sc in scenes):
                # No scene of this item is on, so it was showing on its own: switch it off like any other item.
                item["enabled"] = False
        else:
            item["enabled"] = False
        await self._async_commit()
        return True

    async def async_clear_mute(self, item_id: str) -> bool:
        item = self.find_item(item_id)
        if item is None or item["id"] != item_id:
            return False
        item["muted"] = {}
        await self._async_commit()
        return True

    def _prune_mutes(self) -> None:
        """Drop mutes that can no longer matter, so they neither pile up nor match something by accident."""
        scenes = {sc["id"]: sc for sc in self.scenes}
        cutoff = (date.today() - timedelta(days=400)).isoformat()
        for item in self.items:
            keep = {}
            for scene_id, token in item["muted"].items():
                scene = scenes.get(scene_id)
                if scene is None or item["id"] not in scene["item_ids"]:
                    continue  # the scene or the membership is gone
                if token == "run":
                    if not scene["running"]:
                        continue  # Run now ended
                elif token < cutoff:
                    continue  # an old date occurrence
                keep[scene_id] = token
            item["muted"] = keep

    async def async_stop_all(self) -> int:
        """Clear every Run now (items and scenes). Returns how many were running."""
        changed = 0
        for entry in [*self.items, *self.scenes]:
            if entry["running"]:
                entry["running"] = False
                changed += 1
        if changed:
            await self._async_commit()
        return changed

    async def async_save_scene(self, raw: dict[str, Any]) -> dict[str, Any]:
        raw_id = raw.get("id") if isinstance(raw, dict) else None
        existing = self.find_scene(raw_id) if isinstance(raw_id, str) else None
        scene = normalize_scene(raw, existing, self._data["next_order"])
        for item_id in scene["item_ids"]:
            item = self.find_item(item_id)
            if item is None or item["id"] != item_id:
                raise ValueError("a scene item no longer exists")
            if sensor_driven(item):
                raise ValueError(f"{item['name']} is triggered by a sensor or weather, so it can't be in a scene")
        # An item added to a scene hands control to the scene: its own switch goes off (switch it back on to use it alone).
        before = set(existing["item_ids"]) if existing else set()
        for item_id in scene["item_ids"]:
            if item_id not in before:
                self.find_item(item_id)["enabled"] = False
        if existing is None:
            self._data["next_order"] += 1
            self.scenes.append(scene)
        else:
            self.scenes[self.scenes.index(existing)] = scene
        await self._async_commit()
        return scene

    async def async_delete_scene(self, scene_id: str) -> bool:
        scene = self.find_scene(scene_id)
        if scene is None:
            return False
        self.scenes.remove(scene)
        await self._async_commit()
        return True

    async def async_set_scene_enabled(self, scene_id: str, enabled: bool) -> bool:
        scene = self.find_scene(scene_id)
        if scene is None:
            return False
        scene["enabled"] = enabled
        await self._async_commit()
        return True

    async def async_remove_storage(self) -> None:
        await self._store.async_remove()


async def async_remove_storage_file(hass: HomeAssistant) -> None:
    """Delete the storage file (used when the integration is removed)."""
    await Store(hass, STORAGE_VERSION, STORAGE_KEY).async_remove()
