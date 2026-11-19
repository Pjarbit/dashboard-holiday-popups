"""Master switch, one switch per item and one per scene."""
# Integration version: 1.0.6
from __future__ import annotations

from typing import Any

from homeassistant.components.switch import SwitchEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DOMAIN
from .storage import PopupStore


class _BaseSwitch(SwitchEntity):
    _attr_should_poll = False
    _attr_has_entity_name = False

    def __init__(self, store: PopupStore) -> None:
        self._store = store

    async def async_added_to_hass(self) -> None:
        self.async_on_remove(self._store.add_listener(self._handle_update))

    @callback
    def _handle_update(self, payload: dict[str, Any]) -> None:
        if payload.get("type") == "config" and self.hass is not None:
            self.async_write_ha_state()


class MasterSwitch(_BaseSwitch):
    """Pauses or resumes everything."""

    _attr_name = "Dashboard Holiday Popups"
    _attr_icon = "mdi:party-popper"

    def __init__(self, store: PopupStore, entry: ConfigEntry) -> None:
        super().__init__(store)
        self._attr_unique_id = f"{entry.entry_id}_master"

    @property
    def is_on(self) -> bool:
        return self._store.settings["enabled"]

    async def async_turn_on(self, **kwargs: Any) -> None:
        await self._store.async_save_settings({"enabled": True})

    async def async_turn_off(self, **kwargs: Any) -> None:
        await self._store.async_save_settings({"enabled": False})


class ItemSwitch(_BaseSwitch):
    """Pause or resume one item."""

    def __init__(self, store: PopupStore, entry: ConfigEntry, item_id: str) -> None:
        super().__init__(store)
        self._item_id = item_id
        self._attr_unique_id = f"{entry.entry_id}_item_{item_id}"

    def _item(self) -> dict[str, Any] | None:
        return self._store.find_item(self._item_id)

    @property
    def entity_registry_enabled_default(self) -> bool:
        """Starter items keep a quiet registry entry; turn one on in the entity settings if you want it."""
        item = self._item()
        return not (item and item["image"]["builtin"])

    @property
    def available(self) -> bool:
        return self._item() is not None

    @property
    def name(self) -> str:
        item = self._item()
        return f"Dashboard Holiday Popups {item['name']}" if item else "Dashboard Holiday Popups item"

    @property
    def is_on(self) -> bool:
        item = self._item()
        return bool(item and item["enabled"])

    async def async_turn_on(self, **kwargs: Any) -> None:
        await self._store.async_set_item_enabled(self._item_id, True)

    async def async_turn_off(self, **kwargs: Any) -> None:
        await self._store.async_set_item_enabled(self._item_id, False)


class SceneSwitch(_BaseSwitch):
    """Pause or resume one scene."""

    def __init__(self, store: PopupStore, entry: ConfigEntry, scene_id: str) -> None:
        super().__init__(store)
        self._scene_id = scene_id
        self._attr_unique_id = f"{entry.entry_id}_scene_{scene_id}"
        self._attr_icon = "mdi:image-multiple"

    def _scene(self) -> dict[str, Any] | None:
        return self._store.find_scene(self._scene_id)

    @property
    def available(self) -> bool:
        return self._scene() is not None

    @property
    def name(self) -> str:
        scene = self._scene()
        return f"Dashboard Holiday Popups scene {scene['name']}" if scene else "Dashboard Holiday Popups scene"

    @property
    def is_on(self) -> bool:
        scene = self._scene()
        return bool(scene and scene["enabled"])

    async def async_turn_on(self, **kwargs: Any) -> None:
        await self._store.async_set_scene_enabled(self._scene_id, True)

    async def async_turn_off(self, **kwargs: Any) -> None:
        await self._store.async_set_scene_enabled(self._scene_id, False)


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    store: PopupStore = hass.data[DOMAIN]["store"]
    known: dict[str, ItemSwitch] = {}
    known_scenes: dict[str, SceneSwitch] = {}
    async_add_entities([MasterSwitch(store, entry)])

    def _drop(switch: _BaseSwitch) -> None:
        registry = er.async_get(hass)
        if switch.entity_id and registry.async_get(switch.entity_id):
            registry.async_remove(switch.entity_id)

    @callback
    def sync(payload: dict[str, Any] | None = None) -> None:
        if payload is not None and payload.get("type") != "config":
            return
        current_ids = {item["id"] for item in store.items}
        new = [ItemSwitch(store, entry, i) for i in current_ids if i not in known]
        for switch in new:
            known[switch._item_id] = switch
        scene_ids = {scene["id"] for scene in store.scenes}
        new_scenes = [SceneSwitch(store, entry, i) for i in scene_ids if i not in known_scenes]
        for scene_switch in new_scenes:
            known_scenes[scene_switch._scene_id] = scene_switch
        if new or new_scenes:
            async_add_entities([*new, *new_scenes])
        for item_id in [i for i in known if i not in current_ids]:
            _drop(known.pop(item_id))
        for scene_id in [i for i in known_scenes if i not in scene_ids]:
            _drop(known_scenes.pop(scene_id))

    sync()
    entry.async_on_unload(store.add_listener(sync))
