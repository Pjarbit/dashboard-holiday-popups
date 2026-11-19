"""Dashboard Holiday Popups: animated characters, popups and decorations over dashboards."""
# Integration version: 1.0.6
from __future__ import annotations

import hashlib
import logging
import os
import re
import shutil
import time
from typing import Any
from urllib.parse import unquote

from aiohttp import web
import voluptuous as vol

from homeassistant.components import frontend, panel_custom, websocket_api
from homeassistant.components.http import HomeAssistantView, StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant, ServiceCall, callback
from homeassistant.helpers import config_validation as cv

from .const import (
    KINDS,
    ALLOWED_EXTENSIONS,
    BUILTIN_URL,
    CLEANUP_GRACE_SECONDS,
    DOMAIN,
    EVENT_COMMAND,
    FILES_URL,
    MAX_UPLOAD_BYTES,
    PANEL_ELEMENT,
    PANEL_JS_URL,
    PANEL_URL_PATH,
    RUNTIME_JS_URL,
    UPLOAD_URL,
)
from .storage import PopupStore, async_remove_storage_file

_LOGGER = logging.getLogger(__name__)

PLATFORMS = [Platform.SWITCH]
CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)

_ONCE_STATIC = f"{DOMAIN}_static_registered"
_ONCE_WS = f"{DOMAIN}_ws_registered"

_MODULE_DIR = os.path.dirname(__file__)


def files_dir(hass: HomeAssistant) -> str:
    """Folder (under the Home Assistant config folder) that holds uploaded images."""
    return hass.config.path(DOMAIN)


def get_store(hass: HomeAssistant) -> PopupStore | None:
    return hass.data.get(DOMAIN, {}).get("store")


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    hass.data.setdefault(DOMAIN, {})
    return True


async def _async_register_static(hass: HomeAssistant) -> None:
    """Static paths cannot be removed again, so they are registered once per run."""
    if hass.data.get(_ONCE_STATIC):
        return
    folder = files_dir(hass)
    await hass.async_add_executor_job(lambda: os.makedirs(folder, exist_ok=True))
    await hass.http.async_register_static_paths(
        [
            StaticPathConfig(RUNTIME_JS_URL, os.path.join(_MODULE_DIR, "frontend", "dashboard-holiday-popups.js"), False),
            StaticPathConfig(PANEL_JS_URL, os.path.join(_MODULE_DIR, "panel.js"), False),
            StaticPathConfig(BUILTIN_URL, os.path.join(_MODULE_DIR, "defaults"), False),
        ]
    )
    hass.http.register_view(UploadView())
    hass.http.register_view(UploadedFileView())
    hass.data[_ONCE_STATIC] = True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    domain_data = hass.data.setdefault(DOMAIN, {})

    store = PopupStore(hass)
    await store.async_load()
    domain_data["store"] = store

    await _async_register_static(hass)

    if not hass.data.get(_ONCE_WS):
        websocket_api.async_register_command(hass, ws_get_config)
        websocket_api.async_register_command(hass, ws_subscribe_config)
        websocket_api.async_register_command(hass, ws_save_item)
        websocket_api.async_register_command(hass, ws_delete_item)
        websocket_api.async_register_command(hass, ws_disable_all)
        websocket_api.async_register_command(hass, ws_save_settings)
        websocket_api.async_register_command(hass, ws_list_entities)
        websocket_api.async_register_command(hass, ws_run_item)
        websocket_api.async_register_command(hass, ws_run_scene)
        websocket_api.async_register_command(hass, ws_dismiss_item)
        websocket_api.async_register_command(hass, ws_unmute_item)
        websocket_api.async_register_command(hass, ws_stop_all)
        websocket_api.async_register_command(hass, ws_save_scene)
        websocket_api.async_register_command(hass, ws_delete_scene)
        hass.data[_ONCE_WS] = True

    _register_services(hass)

    # Load the runtime on every Home Assistant page. The URL contains the version.
    frontend.add_extra_js_url(hass, RUNTIME_JS_URL)

    frontend.async_remove_panel(hass, PANEL_URL_PATH, warn_if_unknown=False)
    await panel_custom.async_register_panel(
        hass,
        frontend_url_path=PANEL_URL_PATH,
        webcomponent_name=PANEL_ELEMENT,
        sidebar_title="Holiday Popups",
        sidebar_icon="mdi:party-popper",
        js_url=PANEL_JS_URL,
        require_admin=True,
    )

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    if not await hass.config_entries.async_unload_platforms(entry, PLATFORMS):
        return False
    store = hass.data.get(DOMAIN, {}).pop("store", None)
    if store:
        store.shutdown()
    frontend.remove_extra_js_url(hass, RUNTIME_JS_URL)
    frontend.async_remove_panel(hass, PANEL_URL_PATH, warn_if_unknown=False)
    for service in (SERVICE_SHOW_POPUP, SERVICE_HIDE_ALL, SERVICE_SET_ENABLED):
        hass.services.async_remove(DOMAIN, service)
    return True


async def async_remove_entry(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Integration deleted: remove the storage file and the uploaded images."""
    await async_remove_storage_file(hass)
    await hass.async_add_executor_job(shutil.rmtree, files_dir(hass), True)


# ---------------------------------------------------------------------------
# Services
# ---------------------------------------------------------------------------

SERVICE_SHOW_POPUP = "show_popup"
SERVICE_HIDE_ALL = "hide_all"
SERVICE_SET_ENABLED = "set_enabled"


def _register_services(hass: HomeAssistant) -> None:
    async def show_popup(call: ServiceCall) -> None:
        store = get_store(hass)
        if store is None:
            return
        item = store.find_item(call.data["item"])
        if item is None:
            raise vol.Invalid(f"No item with id or name {call.data['item']!r}")
        command = {"command": "show", "item_id": item["id"]}
        if "message" in call.data:
            command["message"] = call.data["message"]
        if "duration" in call.data:
            command["duration"] = call.data["duration"]
        store.send_command(command)
        hass.bus.async_fire(EVENT_COMMAND, command)

    async def hide_all(call: ServiceCall) -> None:
        store = get_store(hass)
        if store is not None:
            store.send_command({"command": "hide_all"})
            hass.bus.async_fire(EVENT_COMMAND, {"command": "hide_all"})

    async def set_enabled(call: ServiceCall) -> None:
        store = get_store(hass)
        if store is None:
            return
        item = store.find_item(call.data["item"])
        if item is None:
            raise vol.Invalid(f"No item with id or name {call.data['item']!r}")
        await store.async_set_item_enabled(item["id"], call.data["enabled"])

    hass.services.async_register(
        DOMAIN,
        SERVICE_SHOW_POPUP,
        show_popup,
        schema=vol.Schema(
            {
                vol.Required("item"): cv.string,
                vol.Optional("message"): vol.All(cv.string, vol.Length(max=200)),
                vol.Optional("duration"): vol.All(vol.Coerce(float), vol.Range(min=1, max=600)),
            }
        ),
    )
    hass.services.async_register(DOMAIN, SERVICE_HIDE_ALL, hide_all, schema=vol.Schema({}))
    hass.services.async_register(
        DOMAIN,
        SERVICE_SET_ENABLED,
        set_enabled,
        schema=vol.Schema({vol.Required("item"): cv.string, vol.Required("enabled"): cv.boolean}),
    )


# ---------------------------------------------------------------------------
# Websocket API
# Reading the configuration is open to any signed-in user (every browser needs
# it to draw items). Everything that changes data or lists entities is admin only.
# ---------------------------------------------------------------------------


def _store_or_error(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> PopupStore | None:
    store = get_store(hass)
    if store is None:
        connection.send_error(msg["id"], "not_loaded", "Dashboard Holiday Popups is not loaded")
    return store


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/get_config"})
@callback
def ws_get_config(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    if (store := _store_or_error(hass, connection, msg)) is not None:
        connection.send_result(msg["id"], store.config_payload())


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/subscribe_config"})
@callback
def ws_subscribe_config(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    if (store := _store_or_error(hass, connection, msg)) is None:
        return

    @callback
    def forward(payload: dict[str, Any]) -> None:
        connection.send_message(websocket_api.event_message(msg["id"], payload))

    connection.subscriptions[msg["id"]] = store.add_listener(forward)
    connection.send_result(msg["id"])
    forward({"type": "config", "config": store.config_payload()})


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/save_item", vol.Required("item"): dict})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_save_item(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    if (store := _store_or_error(hass, connection, msg)) is None:
        return
    try:
        item = await store.async_save_item(msg["item"])
    except ValueError as err:
        connection.send_error(msg["id"], "invalid_item", str(err))
        return
    await _async_cleanup_files(hass, store)
    connection.send_result(msg["id"], {"item": item})


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/delete_item", vol.Required("item_id"): str})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_delete_item(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    if (store := _store_or_error(hass, connection, msg)) is None:
        return
    if not await store.async_delete_item(msg["item_id"]):
        connection.send_error(msg["id"], "not_found", "Item not found")
        return
    await _async_cleanup_files(hass, store)
    connection.send_result(msg["id"])


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/disable_all",
        vol.Optional("kind"): vol.In(KINDS),
        vol.Optional("item_ids"): [str],
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_disable_all(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """Pause every item, or every item of one kind. There is deliberately no turn-all-on."""
    if (store := _store_or_error(hass, connection, msg)) is None:
        return
    changed = await store.async_disable_all(msg.get("kind"), msg.get("item_ids"))
    connection.send_result(msg["id"], {"changed": changed})


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/save_settings", vol.Required("settings"): dict})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_save_settings(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    if (store := _store_or_error(hass, connection, msg)) is None:
        return
    connection.send_result(msg["id"], {"settings": await store.async_save_settings(msg["settings"])})


@websocket_api.websocket_command(
    {vol.Required("type"): f"{DOMAIN}/run_item", vol.Required("item_id"): str, vol.Required("running"): bool}
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_run_item(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """Run now / Stop for one item. Saved, so it survives a reload and a restart."""
    if (store := _store_or_error(hass, connection, msg)) is None:
        return
    if not await store.async_set_running(msg["item_id"], msg["running"]):
        connection.send_error(msg["id"], "not_found", "Item not found")
        return
    connection.send_result(msg["id"])


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/dismiss_item",
        vol.Required("item_id"): str,
        # {scene id: the occurrence it is muted for}: a date, or "run" for a Run now scene
        vol.Optional("occurrences", default={}): vol.Schema({vol.All(str, vol.Length(max=40)): vol.All(str, vol.Length(max=40))}),
    }
)
@websocket_api.async_response
async def ws_dismiss_item(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """A character or popup was pushed aside with "turn off". Open to any signed-in user (a wall tablet is
    usually not an administrator), and it can only ever switch an item off, never anything else."""
    if (store := _store_or_error(hass, connection, msg)) is None:
        return
    if not await store.async_dismiss(msg["item_id"], msg["occurrences"]):
        connection.send_error(msg["id"], "not_found", "Item not found")
        return
    connection.send_result(msg["id"])


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/unmute_item", vol.Required("item_id"): str})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_unmute_item(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """Bring back an item that was pushed away for the rest of a scene's current run."""
    if (store := _store_or_error(hass, connection, msg)) is None:
        return
    if not await store.async_clear_mute(msg["item_id"]):
        connection.send_error(msg["id"], "not_found", "Item not found")
        return
    connection.send_result(msg["id"])


@websocket_api.websocket_command(
    {vol.Required("type"): f"{DOMAIN}/run_scene", vol.Required("scene_id"): str, vol.Required("running"): bool}
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_run_scene(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    if (store := _store_or_error(hass, connection, msg)) is None:
        return
    if not await store.async_set_scene_running(msg["scene_id"], msg["running"]):
        connection.send_error(msg["id"], "not_found", "Scene not found")
        return
    connection.send_result(msg["id"])


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/stop_all"})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_stop_all(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """Clear every Run now."""
    if (store := _store_or_error(hass, connection, msg)) is None:
        return
    connection.send_result(msg["id"], {"changed": await store.async_stop_all()})


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/save_scene", vol.Required("scene"): dict})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_save_scene(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    if (store := _store_or_error(hass, connection, msg)) is None:
        return
    try:
        scene = await store.async_save_scene(msg["scene"])
    except ValueError as err:
        connection.send_error(msg["id"], "invalid_scene", str(err))
        return
    connection.send_result(msg["id"], {"scene": scene})


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/delete_scene", vol.Required("scene_id"): str})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_delete_scene(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    if (store := _store_or_error(hass, connection, msg)) is None:
        return
    if not await store.async_delete_scene(msg["scene_id"]):
        connection.send_error(msg["id"], "not_found", "Scene not found")
        return
    connection.send_result(msg["id"])


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/list_entities"})
@websocket_api.require_admin
@callback
def ws_list_entities(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    entities = [
        {
            "entity_id": state.entity_id,
            "name": state.attributes.get("friendly_name", state.entity_id),
            "domain": state.domain,
        }
        for state in hass.states.async_all()
    ]
    entities.sort(key=lambda e: e["entity_id"])
    connection.send_result(msg["id"], {"entities": entities})


# ---------------------------------------------------------------------------
# Upload
# ---------------------------------------------------------------------------


def detect_extension(data: bytes) -> str | None:
    """Identify the real image type from its first bytes (not from the name)."""
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return ".gif"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return ".png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return ".webp"
    return None


def _slug(filename: str) -> str:
    stem = os.path.splitext(os.path.basename(unquote(filename or "image")))[0].lower()
    return re.sub(r"[^a-z0-9]+", "-", stem).strip("-")[:30] or "image"


def _write_file(path: str, data: bytes) -> None:
    with open(path, "wb") as handle:
        handle.write(data)


def _cleanup_sync(folder: str, keep: set[str]) -> int:
    removed = 0
    now = time.time()
    try:
        names = os.listdir(folder)
    except OSError:
        return 0
    for name in names:
        path = os.path.join(folder, name)
        if name in keep or not os.path.isfile(path):
            continue
        # Skip files uploaded a moment ago that the panel has not attached yet.
        if now - os.path.getmtime(path) < CLEANUP_GRACE_SECONDS:
            continue
        try:
            os.remove(path)
            removed += 1
        except OSError:
            _LOGGER.warning("Could not remove unused image %s", name)
    return removed


async def _async_cleanup_files(hass: HomeAssistant, store: PopupStore) -> None:
    await hass.async_add_executor_job(_cleanup_sync, files_dir(hass), store.referenced_files())


_UPLOAD_NAME = re.compile(r"^[a-z0-9][a-z0-9._-]{0,127}$")
_UPLOAD_MIME = {".gif": "image/gif", ".png": "image/png", ".apng": "image/png", ".webp": "image/webp"}


def _resolve_upload(folder: str, name: str) -> str | None:
    """Path of one uploaded picture, or None. Only a plain file name inside the uploads folder is accepted."""
    if not _UPLOAD_NAME.match(name) or ".." in name:
        return None
    if os.path.splitext(name)[1].lower() not in _UPLOAD_MIME:
        return None
    root = os.path.realpath(folder)
    path = os.path.join(root, name)
    if os.path.islink(path) or os.path.realpath(path) != path or not os.path.isfile(path):
        return None
    return path


class UploadedFileView(HomeAssistantView):
    """Uploaded pictures, for signed-in users only (static paths skip authentication)."""

    url = FILES_URL + "/{filename}"
    name = f"api:{DOMAIN}:files"
    requires_auth = True

    async def get(self, request: web.Request, filename: str) -> web.StreamResponse:
        hass: HomeAssistant = request.app["hass"]
        path = await hass.async_add_executor_job(_resolve_upload, files_dir(hass), filename)
        if path is None:
            return web.Response(status=404)
        return web.FileResponse(
            path,
            headers={
                "Content-Type": _UPLOAD_MIME[os.path.splitext(path)[1].lower()],
                "Cache-Control": "private, max-age=31536000, immutable",
                "X-Content-Type-Options": "nosniff",
            },
        )


class UploadView(HomeAssistantView):
    """Authenticated image upload (admin only)."""

    url = UPLOAD_URL
    name = f"api:{DOMAIN}:upload"
    requires_auth = True

    async def post(self, request: web.Request) -> web.Response:
        hass: HomeAssistant = request.app["hass"]
        user = request.get("hass_user")
        if user is None or not user.is_admin:
            return self.json_message("Admin access required", 403)
        if get_store(hass) is None:
            return self.json_message("Not loaded", 503)

        try:
            reader = await request.multipart()
            field = await reader.next()
        except Exception:
            return self.json_message("Expected a multipart upload", 400)
        if field is None or getattr(field, "name", None) != "file":
            return self.json_message("Missing 'file' field", 400)

        original = field.filename or "image"
        if os.path.splitext(original)[1].lower() not in ALLOWED_EXTENSIONS:
            return self.json_message("Only GIF, WebP, APNG and PNG files are accepted", 400)

        data = bytearray()
        while True:
            chunk = await field.read_chunk(64 * 1024)
            if not chunk:
                break
            data.extend(chunk)
            if len(data) > MAX_UPLOAD_BYTES:
                return self.json_message(f"File is larger than {MAX_UPLOAD_BYTES // (1024 * 1024)} MB", 413)
        if not data:
            return self.json_message("Empty file", 400)

        ext = detect_extension(bytes(data[:16]))
        if ext is None:
            return self.json_message("File content is not a GIF, WebP or PNG image", 400)

        digest = hashlib.sha256(data).hexdigest()[:8]
        filename = f"{_slug(original)}-{digest}{ext}"
        folder = files_dir(hass)
        await hass.async_add_executor_job(_write_file, os.path.join(folder, filename), bytes(data))
        return self.json({"file": filename, "url": f"{FILES_URL}/{filename}"})
