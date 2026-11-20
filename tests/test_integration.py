"""Setup, unload, reload, websocket, upload, services, switches."""
import os

from homeassistant.components.frontend import DATA_EXTRA_MODULE_URL, async_panel_exists
from homeassistant.helpers import entity_registry as er
import pytest

from custom_components.dashboard_holiday_popups import files_dir, get_store
from custom_components.dashboard_holiday_popups.const import (
    DOMAIN,
    PANEL_URL_PATH,
    RUNTIME_JS_URL,
    UPLOAD_URL,
)

GIF = b"GIF89a" + b"\x01\x00\x01\x00\x80\x00\x00" + b"\x00" * 40
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 40


async def test_setup_registers_everything(hass, setup_integration):
    assert RUNTIME_JS_URL in hass.data[DATA_EXTRA_MODULE_URL].urls
    assert async_panel_exists(hass, PANEL_URL_PATH)
    for service in ("show_popup", "hide_all", "set_enabled"):
        assert hass.services.has_service(DOMAIN, service)
    assert hass.states.get("switch.dashboard_holiday_popups") is not None
    assert "?" not in RUNTIME_JS_URL


async def test_unload_removes_everything(hass, setup_integration):
    assert await hass.config_entries.async_unload(setup_integration.entry_id)
    await hass.async_block_till_done()
    assert RUNTIME_JS_URL not in hass.data[DATA_EXTRA_MODULE_URL].urls
    assert not async_panel_exists(hass, PANEL_URL_PATH)
    for service in ("show_popup", "hide_all", "set_enabled"):
        assert not hass.services.has_service(DOMAIN, service)
    assert get_store(hass) is None


async def test_reload_twice_does_not_duplicate(hass, setup_integration):
    for _ in range(2):
        assert await hass.config_entries.async_reload(setup_integration.entry_id)
        await hass.async_block_till_done()
    urls = [u for u in hass.data[DATA_EXTRA_MODULE_URL].urls if DOMAIN in u]
    assert urls == [RUNTIME_JS_URL]
    assert async_panel_exists(hass, PANEL_URL_PATH)
    registry = er.async_get(hass)
    switches = [e for e in registry.entities.values() if e.platform == DOMAIN]
    from custom_components.dashboard_holiday_popups.seed import seed_items

    assert len(switches) == 1 + len(seed_items())  # master + one per starter item


async def test_get_config_open_to_any_user_but_writes_are_admin_only(
    hass, setup_integration, hass_ws_client, hass_read_only_access_token
):
    client = await hass_ws_client(hass, hass_read_only_access_token)
    await client.send_json({"id": 1, "type": f"{DOMAIN}/get_config"})
    assert (await client.receive_json())["success"]
    for i, msg in enumerate(
        [
            {"type": f"{DOMAIN}/save_item", "item": {"kind": "popup", "name": "x"}},
            {"type": f"{DOMAIN}/delete_item", "item_id": "abc"},
            {"type": f"{DOMAIN}/save_settings", "settings": {}},
            {"type": f"{DOMAIN}/list_entities"},
            {"type": f"{DOMAIN}/run_item", "item_id": "abc", "running": True},
            {"type": f"{DOMAIN}/run_scene", "scene_id": "abc", "running": True},
            {"type": f"{DOMAIN}/stop_all"},
            {"type": f"{DOMAIN}/save_scene", "scene": {"name": "x"}},
            {"type": f"{DOMAIN}/delete_scene", "scene_id": "abc"},
            {"type": f"{DOMAIN}/disable_all"},
        ],
        start=2,
    ):
        await client.send_json({"id": i, **msg})
        reply = await client.receive_json()
        assert not reply["success"] and reply["error"]["code"] == "unauthorized", msg["type"]


async def test_admin_save_delete_and_bad_input(hass, setup_integration, hass_ws_client):
    client = await hass_ws_client(hass)
    await client.send_json(
        {"id": 1, "type": f"{DOMAIN}/save_item", "item": {"kind": "popup", "name": "Mail", "image": {"file": "m-1.gif"}}}
    )
    reply = await client.receive_json()
    assert reply["success"]
    item_id = reply["result"]["item"]["id"]
    await hass.async_block_till_done()
    assert hass.states.get("switch.dashboard_holiday_popups_mail") is not None

    await client.send_json(
        {"id": 2, "type": f"{DOMAIN}/save_item", "item": {"kind": "popup", "name": "Bad", "triggers": [{"type": "date", "date": "02-30"}]}}
    )
    reply = await client.receive_json()
    assert not reply["success"] and reply["error"]["code"] == "invalid_item"

    await client.send_json({"id": 3, "type": f"{DOMAIN}/delete_item", "item_id": item_id})
    assert (await client.receive_json())["success"]
    await hass.async_block_till_done()
    assert hass.states.get("switch.dashboard_holiday_popups_mail") is None


async def test_subscription_pushes_updates_and_shutdown(hass, setup_integration, hass_ws_client):
    import asyncio

    client = await hass_ws_client(hass)
    await client.send_json({"id": 1, "type": f"{DOMAIN}/subscribe_config"})
    messages = [await asyncio.wait_for(client.receive_json(), 5) for _ in range(2)]
    assert any(m.get("event", {}).get("type") == "config" for m in messages)

    await client.send_json({"id": 2, "type": f"{DOMAIN}/save_settings", "settings": {"max_simultaneous": 5}})
    messages = [await asyncio.wait_for(client.receive_json(), 5) for _ in range(2)]
    pushed = [m for m in messages if m["id"] == 1][0]
    assert pushed["event"]["config"]["settings"]["max_simultaneous"] == 5

    await hass.config_entries.async_unload(setup_integration.entry_id)
    await hass.async_block_till_done()
    last = await asyncio.wait_for(client.receive_json(), 5)
    assert last["id"] == 1 and last["event"]["type"] == "shutdown"


async def test_services(hass, setup_integration):
    store = get_store(hass)
    events = []
    store.add_listener(events.append)
    menorah = store.find_item("Menorah")
    assert menorah["enabled"] is False
    await hass.services.async_call(DOMAIN, "set_enabled", {"item": "menorah", "enabled": True}, blocking=True)
    assert store.find_item("Menorah")["enabled"] is True
    await hass.services.async_call(DOMAIN, "show_popup", {"item": "Flying witch", "message": "Boo"}, blocking=True)
    assert events[-1] == {
        "type": "command", "command": "show", "item_id": store.find_item("Flying witch")["id"], "message": "Boo"
    }
    await hass.services.async_call(DOMAIN, "hide_all", {}, blocking=True)
    assert events[-1]["command"] == "hide_all"
    with pytest.raises(Exception):
        await hass.services.async_call(DOMAIN, "show_popup", {"item": "nope"}, blocking=True)


async def test_switches_pause_items_and_master(hass, setup_integration):
    store = get_store(hass)
    mine = await store.async_save_item({"kind": "popup", "name": "Mine", "enabled": False, "image": {"file": "m-1.gif"}})
    await hass.async_block_till_done()
    await hass.services.async_call("switch", "turn_on", {"entity_id": "switch.dashboard_holiday_popups_mine"}, blocking=True)
    assert store.find_item(mine["id"])["enabled"] is True
    await hass.services.async_call("switch", "turn_off", {"entity_id": "switch.dashboard_holiday_popups"}, blocking=True)
    assert store.settings["enabled"] is False
    await hass.async_block_till_done()
    assert hass.states.get("switch.dashboard_holiday_popups").state == "off"


def _form(data: bytes, filename: str):
    from aiohttp import FormData

    form = FormData()
    form.add_field("file", data, filename=filename)
    return form


async def test_upload_validation_and_naming(hass, setup_integration, hass_client, hass_read_only_access_token):
    client = await hass_client()
    resp = await client.post(UPLOAD_URL, data=_form(GIF, "My Witch!.gif"))
    assert resp.status == 200
    body = await resp.json()
    assert body["file"].startswith("my-witch-") and body["file"].endswith(".gif")
    assert os.path.exists(os.path.join(files_dir(hass), body["file"]))
    # same bytes => same name, different bytes => different name
    again = await (await client.post(UPLOAD_URL, data=_form(GIF, "My Witch!.gif"))).json()
    assert again["file"] == body["file"]
    other = await (await client.post(UPLOAD_URL, data=_form(GIF + b"x", "My Witch!.gif"))).json()
    assert other["file"] != body["file"]

    assert (await client.post(UPLOAD_URL, data=_form(GIF, "x.exe"))).status == 400
    assert (await client.post(UPLOAD_URL, data=_form(b"not an image at all", "x.png"))).status == 400
    assert (await client.post(UPLOAD_URL, data=_form(b"", "x.png"))).status == 400
    assert (await client.post(UPLOAD_URL, data=_form(PNG + b"\x00" * (5 * 1024 * 1024), "big.png"))).status == 413
    assert (await client.post(UPLOAD_URL, data=_form(b"MZ" + b"\x00" * 30, "evil.gif"))).status == 400  # wrong bytes

    ro = await hass_client(hass_read_only_access_token)
    assert (await ro.post(UPLOAD_URL, data=_form(GIF, "a.gif"))).status == 403


async def test_upload_requires_auth(hass, setup_integration, hass_client_no_auth):
    client = await hass_client_no_auth()
    assert (await client.post(UPLOAD_URL, data=_form(GIF, "a.gif"))).status == 401


async def test_uploaded_pictures_need_a_signed_in_user(hass, setup_integration, hass_client, hass_client_no_auth):
    client = await hass_client()
    up = await (await client.post(UPLOAD_URL, data=_form(GIF, "Kid party.gif"))).json()
    url = up["url"]
    assert url.startswith("/dashboard_holiday_popups_files/")

    anonymous = await hass_client_no_auth()
    assert (await anonymous.get(url)).status == 401

    resp = await client.get(url)
    assert resp.status == 200
    assert (await resp.read()).startswith(b"GIF8")
    assert resp.headers["Content-Type"] == "image/gif"
    assert resp.headers["Cache-Control"] == "private, max-age=31536000, immutable"
    assert resp.headers["X-Content-Type-Options"] == "nosniff"


async def test_uploaded_picture_view_only_serves_plain_picture_names(hass, setup_integration, hass_client):
    client = await hass_client()
    folder = files_dir(hass)
    secret = os.path.join(os.path.dirname(folder), "secret.png")
    with open(secret, "wb") as fh:
        fh.write(PNG)
    with open(os.path.join(folder, "notes.txt"), "w") as fh:
        fh.write("not a picture")
    os.symlink(secret, os.path.join(folder, "link-1.png"))
    base = "/dashboard_holiday_popups_files/"
    for bad in (
        "../secret.png", "..%2Fsecret.png", "%2e%2e%2fsecret.png", "%2e%2e/secret.png",
        "notes.txt", "link-1.png", "missing-1.png", ".hidden.png", "UPPER-1.png", "a%5Cb.png",
    ):
        resp = await client.get(base + bad)
        assert resp.status in (400, 404), bad
    assert (await client.get(base)).status in (404, 405)
    # the old, unauthenticated static location is gone
    assert (await client.get("/dashboard_holiday_popups_files/notes.txt")).status == 404


async def test_resolve_upload_rules(tmp_path):
    from custom_components.dashboard_holiday_popups import _resolve_upload

    good = tmp_path / "witch-1a2b3c4d.webp"
    good.write_bytes(b"RIFFxxxxWEBP")
    assert _resolve_upload(str(tmp_path), "witch-1a2b3c4d.webp") == str(good)
    for bad in ("../x.png", "a/b.png", "a\\b.png", "x.exe", "x", "..", ".a.png", "A.png", "a..b.png", "", "x" * 200 + ".png"):
        assert _resolve_upload(str(tmp_path), bad) is None, bad
    (tmp_path / "sub").mkdir()
    assert _resolve_upload(str(tmp_path), "sub") is None  # a folder, not a file


async def test_cleanup_removes_only_unreferenced_old_files(hass, setup_integration, hass_ws_client):
    folder = files_dir(hass)
    used, unused, fresh = (os.path.join(folder, n) for n in ("used-1.gif", "unused-2.gif", "fresh-3.gif"))
    for path in (used, unused, fresh):
        with open(path, "wb") as handle:
            handle.write(GIF)
    old = os.path.getmtime(used) - 3600
    os.utime(used, (old, old))
    os.utime(unused, (old, old))
    client = await hass_ws_client(hass)
    await client.send_json({"id": 1, "type": f"{DOMAIN}/save_item", "item": {"kind": "popup", "name": "U", "image": {"file": "used-1.gif"}}})
    assert (await client.receive_json())["success"]
    assert os.path.exists(used)
    assert not os.path.exists(unused)  # old and unreferenced: removed
    assert os.path.exists(fresh)       # uploaded moments ago: kept until attached


async def test_options_flow(hass, setup_integration):
    result = await hass.config_entries.options.async_init(setup_integration.entry_id)
    assert result["type"] == "form"
    result = await hass.config_entries.options.async_configure(
        result["flow_id"], {"enabled": False, "default_dashboards": "/dashboard-2column\n/iphone-dashboard"}
    )
    assert result["type"] == "create_entry"
    store = get_store(hass)
    assert store.settings["enabled"] is False
    assert store.settings["default_dashboards"] == ["/dashboard-2column", "/iphone-dashboard"]


async def test_remove_entry_deletes_files(hass, setup_integration):
    folder = files_dir(hass)
    assert os.path.isdir(folder)
    await hass.config_entries.async_remove(setup_integration.entry_id)
    await hass.async_block_till_done()
    assert not os.path.exists(folder)


async def test_only_one_instance(hass, setup_integration):
    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": "user"})
    assert result["type"] == "abort"


async def test_every_starter_image_is_served(hass, setup_integration, hass_client):
    store = get_store(hass)
    client = await hass_client()
    payload = store.config_payload()
    assert payload["items"] and all(i["image_url"] for i in payload["items"])
    for item in payload["items"]:
        resp = await client.get(item["image_url"])
        assert resp.status == 200, item["name"]
        body = await resp.read()
        assert body[:4] in (b"GIF8", b"RIFF", b"\x89PNG"), item["name"]
        assert "?" not in item["image_url"]


async def test_starter_item_switches_start_disabled_but_your_own_are_live(hass, setup_integration):
    registry = er.async_get(hass)
    starter = registry.async_get("switch.dashboard_holiday_popups_menorah")
    assert starter is not None and starter.disabled_by is not None  # quiet: no state, enable in entity settings
    assert hass.states.get("switch.dashboard_holiday_popups_menorah") is None
    store = get_store(hass)
    await store.async_save_item({"kind": "popup", "name": "Mine", "image": {"file": "m-1.gif"}})
    await hass.async_block_till_done()
    assert hass.states.get("switch.dashboard_holiday_popups_mine") is not None
    assert hass.states.get("switch.dashboard_holiday_popups") is not None  # master is always there


async def test_disable_all_is_admin_only_and_scoped(hass, setup_integration, hass_ws_client, hass_read_only_access_token):
    store = get_store(hass)
    on_before = {i["name"] for i in store.items if i["enabled"]}
    assert "Mummy popup" in on_before and "Running turkey" in on_before
    ro = await hass_ws_client(hass, hass_read_only_access_token)
    await ro.send_json({"id": 1, "type": f"{DOMAIN}/disable_all"})
    assert (await ro.receive_json())["error"]["code"] == "unauthorized"
    admin = await hass_ws_client(hass)
    await admin.send_json({"id": 1, "type": f"{DOMAIN}/disable_all", "kind": "popup"})
    reply = await admin.receive_json()
    assert reply["success"] and reply["result"]["changed"] >= 1
    assert not any(i["enabled"] for i in store.items if i["kind"] == "popup")
    assert any(i["enabled"] for i in store.items if i["kind"] == "floater")  # other kinds untouched
    await admin.send_json({"id": 2, "type": f"{DOMAIN}/disable_all"})
    assert (await admin.receive_json())["success"]
    assert not any(i["enabled"] for i in store.items)
    # nothing to switch off a second time
    await admin.send_json({"id": 3, "type": f"{DOMAIN}/disable_all"})
    assert (await admin.receive_json())["result"]["changed"] == 0
    await admin.send_json({"id": 4, "type": f"{DOMAIN}/enable_all"})
    assert not (await admin.receive_json())["success"]  # there is deliberately no turn-all-on command


async def test_reduced_motion_setting_defaults_on_and_saves(hass, setup_integration, hass_ws_client):
    store = get_store(hass)
    assert store.settings["respect_reduced_motion"] is True
    client = await hass_ws_client(hass)
    await client.send_json({"id": 1, "type": f"{DOMAIN}/save_settings", "settings": {"respect_reduced_motion": False}})
    assert (await client.receive_json())["result"]["settings"]["respect_reduced_motion"] is False


async def test_hide_on_small_screens_setting_defaults_off_and_saves(hass, setup_integration, hass_ws_client):
    store = get_store(hass)
    assert store.settings["hide_on_small_screens"] is False
    client = await hass_ws_client(hass)
    await client.send_json({"id": 1, "type": f"{DOMAIN}/save_settings", "settings": {"hide_on_small_screens": True}})
    assert (await client.receive_json())["result"]["settings"]["hide_on_small_screens"] is True
    await client.send_json({"id": 2, "type": f"{DOMAIN}/save_settings", "settings": {"hide_on_small_screens": "nonsense"}})
    assert (await client.receive_json())["result"]["settings"]["hide_on_small_screens"] is False


async def test_run_now_and_stop_all_over_the_websocket(hass, setup_integration, hass_ws_client):
    store = get_store(hass)
    client = await hass_ws_client(hass)
    menorah = store.find_item("Menorah")["id"]
    await client.send_json({"id": 1, "type": f"{DOMAIN}/run_item", "item_id": menorah, "running": True})
    assert (await client.receive_json())["success"]
    assert store.find_item(menorah)["running"] is True
    await client.send_json({"id": 2, "type": f"{DOMAIN}/run_item", "item_id": "ghost", "running": True})
    assert (await client.receive_json())["error"]["code"] == "not_found"
    await client.send_json({"id": 3, "type": f"{DOMAIN}/stop_all"})
    reply = await client.receive_json()
    assert reply["success"] and reply["result"]["changed"] == 1
    assert store.find_item(menorah)["running"] is False


async def test_scene_websocket_flow_and_switch_entity(hass, setup_integration, hass_ws_client):
    store = get_store(hass)
    client = await hass_ws_client(hass)
    menorah = store.find_item("Menorah")["id"]
    rain = store.find_item("Rain umbrella")["id"]
    rule = {"start": "2026-12-20", "length_days": 5, "repeat": "yearly"}
    await client.send_json({"id": 1, "type": f"{DOMAIN}/save_scene", "scene": {"name": "Hanukkah", "recurrence": rule, "item_ids": [rain]}})
    reply = await client.receive_json()
    assert not reply["success"] and reply["error"]["code"] == "invalid_scene" and "sensor" in reply["error"]["message"]
    await client.send_json({"id": 2, "type": f"{DOMAIN}/save_scene", "scene": {"name": "Hanukkah", "recurrence": rule, "item_ids": [menorah]}})
    reply = await client.receive_json()
    assert reply["success"]
    scene_id = reply["result"]["scene"]["id"]
    await hass.async_block_till_done()
    entity = hass.states.get("switch.dashboard_holiday_popups_scene_hanukkah")
    assert entity is not None and entity.state == "on"
    await hass.services.async_call("switch", "turn_off", {"entity_id": "switch.dashboard_holiday_popups_scene_hanukkah"}, blocking=True)
    assert store.find_scene(scene_id)["enabled"] is False
    await client.send_json({"id": 3, "type": f"{DOMAIN}/run_scene", "scene_id": scene_id, "running": True})
    assert (await client.receive_json())["success"] and store.find_scene(scene_id)["running"] is True
    await client.send_json({"id": 4, "type": f"{DOMAIN}/get_config"})
    assert [sc["name"] for sc in (await client.receive_json())["result"]["scenes"]] == ["Hanukkah"]
    await client.send_json({"id": 5, "type": f"{DOMAIN}/delete_scene", "scene_id": scene_id})
    assert (await client.receive_json())["success"]
    await hass.async_block_till_done()
    assert hass.states.get("switch.dashboard_holiday_popups_scene_hanukkah") is None
    await client.send_json({"id": 6, "type": f"{DOMAIN}/delete_scene", "scene_id": scene_id})
    assert (await client.receive_json())["error"]["code"] == "not_found"


async def test_disable_all_can_be_limited_to_listed_items(hass, setup_integration, hass_ws_client):
    store = get_store(hass)
    client = await hass_ws_client(hass)
    chosen = [i["id"] for i in store.items if i["enabled"] and i["kind"] == "floater"][:2]
    await client.send_json({"id": 1, "type": f"{DOMAIN}/disable_all", "item_ids": chosen})
    assert (await client.receive_json())["result"]["changed"] == 2
    assert all(not store.find_item(i)["enabled"] for i in chosen)
    assert any(i["enabled"] for i in store.items)


async def test_dismiss_item_is_open_to_any_user_and_only_switches_things_off(
    hass, setup_integration, hass_ws_client, hass_read_only_access_token
):
    store = get_store(hass)
    menorah = store.find_item("Menorah")["id"]
    await store.async_set_running(menorah, True)
    ro = await hass_ws_client(hass, hass_read_only_access_token)
    # outside any scene: switched off and no longer running
    await ro.send_json({"id": 1, "type": f"{DOMAIN}/dismiss_item", "item_id": menorah})
    assert (await ro.receive_json())["success"]
    item = store.find_item(menorah)
    assert item["enabled"] is False and item["running"] is False and item["muted"] == {}
    await ro.send_json({"id": 2, "type": f"{DOMAIN}/dismiss_item", "item_id": "ghost"})
    assert (await ro.receive_json())["error"]["code"] == "not_found"
    await ro.send_json({"id": 3, "type": f"{DOMAIN}/dismiss_item", "item_id": menorah, "occurrences": {"s": "x" * 50}})
    assert not (await ro.receive_json())["success"]  # over-long text is refused


async def _scene_with(store, name, items, start="2026-12-04", length=8):
    return await store.async_save_scene(
        {"name": name, "item_ids": items, "recurrence": {"start": start, "repeat": "yearly", "length_days": length}}
    )


async def test_dismiss_in_scenes_mutes_each_live_scene_and_keeps_the_item_enabled(hass, setup_integration):
    store = get_store(hass)
    menorah = store.find_item("Menorah")["id"]
    enabled_before = store.find_item(menorah)["enabled"]
    one = await _scene_with(store, "Hanukkah", [menorah])
    two = await _scene_with(store, "Winter", [menorah], start="2026-12-01", length=30)
    await store.async_set_running(menorah, True)
    assert await store.async_dismiss(menorah, {one["id"]: "2026-12-04", two["id"]: "2026-12-01"})
    item = store.find_item(menorah)
    assert item["muted"] == {one["id"]: "2026-12-04", two["id"]: "2026-12-01"}
    assert item["running"] is False and item["enabled"] == enabled_before


async def test_dismiss_with_no_scene_on_switches_the_item_off_like_any_other(hass, setup_integration):
    store = get_store(hass)
    menorah = store.find_item("Menorah")["id"]
    await _scene_with(store, "Hanukkah", [menorah])
    await store.async_set_item_enabled(menorah, True)
    assert await store.async_dismiss(menorah, {})
    item = store.find_item(menorah)
    assert item["enabled"] is False and item["muted"] == {}


async def test_adding_an_item_to_a_scene_turns_its_own_switch_off_once(hass, setup_integration):
    store = get_store(hass)
    menorah = store.find_item("Menorah")["id"]
    await store.async_set_item_enabled(menorah, True)
    scene = await _scene_with(store, "Hanukkah", [menorah])
    assert store.find_item(menorah)["enabled"] is False
    # switched back on by hand, a later save of the same scene leaves it alone
    await store.async_set_item_enabled(menorah, True)
    await store.async_save_scene({**scene, "name": "Hanukkah 2"})
    assert store.find_item(menorah)["enabled"] is True


async def test_scene_banner_name_is_saved_and_trimmed(hass, setup_integration):
    store = get_store(hass)
    menorah = store.find_item("Menorah")["id"]
    scene = await store.async_save_scene(
        {"name": "Joe's birthday", "banner_name": "Joe", "item_ids": [menorah], "recurrence": {"start": "2026-12-04", "repeat": "yearly", "length_days": 1}}
    )
    assert scene["banner_name"] == "Joe"
    other = await store.async_save_scene({"name": "x", "item_ids": [], "recurrence": {"start": "2026-12-04", "repeat": "yearly"}})
    assert other["banner_name"] == ""


async def test_stop_all_and_stopping_a_scene_clear_run_now_mutes(hass, setup_integration):
    store = get_store(hass)
    menorah = store.find_item("Menorah")["id"]
    one = await _scene_with(store, "Hanukkah", [menorah])
    await store.async_set_scene_running(one["id"], True)
    await store.async_dismiss(menorah, {one["id"]: "run"})
    await store.async_stop_all()
    assert store.find_item(menorah)["muted"] == {}
    # and the next Run now is not muted by the old one
    await store.async_set_scene_running(one["id"], True)
    assert store.find_item(menorah)["muted"] == {}
    await store.async_dismiss(menorah, {one["id"]: "run"})
    await store.async_set_scene_running(one["id"], False)
    assert store.find_item(menorah)["muted"] == {}


async def test_old_and_orphaned_mutes_are_dropped(hass, setup_integration):
    store = get_store(hass)
    menorah = store.find_item("Menorah")["id"]
    one = await _scene_with(store, "Hanukkah", [menorah])
    two = await _scene_with(store, "Other", [menorah])
    store.find_item(menorah)["muted"] = {one["id"]: "2019-12-04", two["id"]: "2026-12-04", "gone": "2026-12-04"}
    await store.async_dismiss(menorah, {})  # any save prunes
    muted = store.find_item(menorah)["muted"]
    assert one["id"] not in muted or muted[one["id"]] == "run"  # the 2019 date is gone (re-muted for Run now only)
    assert "gone" not in muted
    # removing the item from a scene drops its mute there
    two = await store.async_save_scene({**two, "item_ids": []})
    assert two["id"] not in store.find_item(menorah)["muted"]


async def test_unmute_is_admin_only(hass, setup_integration, hass_ws_client, hass_read_only_access_token):
    store = get_store(hass)
    menorah = store.find_item("Menorah")["id"]
    one = await _scene_with(store, "Hanukkah", [menorah])
    await store.async_set_scene_running(one["id"], True)
    await store.async_dismiss(menorah, {one["id"]: "run"})
    ro = await hass_ws_client(hass, hass_read_only_access_token)
    await ro.send_json({"id": 1, "type": f"{DOMAIN}/unmute_item", "item_id": menorah})
    assert not (await ro.receive_json())["success"]
    assert store.find_item(menorah)["muted"]
    admin = await hass_ws_client(hass)
    await admin.send_json({"id": 1, "type": f"{DOMAIN}/unmute_item", "item_id": menorah})
    assert (await admin.receive_json())["success"]
    assert store.find_item(menorah)["muted"] == {}
