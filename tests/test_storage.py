"""Validation and storage behaviour."""
import pytest

from custom_components.dashboard_holiday_popups.recurrence import legacy_to_recurrence, normalize_recurrence
from custom_components.dashboard_holiday_popups.storage import (
    PopupStore,
    normalize_item,
    normalize_scene,
    normalize_settings,
    normalize_trigger,
)


def test_item_requires_name_and_kind():
    with pytest.raises(ValueError):
        normalize_item({"kind": "floater", "name": "  "}, None, 1)
    with pytest.raises(ValueError):
        normalize_item({"kind": "dragon", "name": "x"}, None, 1)


def test_numbers_are_clamped_and_choices_fall_back():
    item = normalize_item(
        {"kind": "floater", "name": "w", "size_px": 99999, "speed": -5, "path": "bogus", "motion": "circle"}, None, 1
    )
    assert item["size_px"] == 1600
    assert item["speed"] == 5
    assert item["path"] == "bottom_straight"
    assert item["motion"] == "circle"


def test_image_file_name_cannot_traverse():
    with pytest.raises(ValueError):
        normalize_item({"kind": "floater", "name": "x", "image": {"file": "../../secret.png"}}, None, 1)


def test_repeat_rule_fills_what_is_missing_from_the_start_date():
    rule = normalize_recurrence({"start": "2026-11-26", "repeat": "yearly"})  # a Thursday, the 4th of November
    assert (rule["month"], rule["day"], rule["weekday"], rule["nth"]) == (11, 26, 4, 4)
    assert rule["weekdays"] == [4] and rule["length_days"] == 1 and rule["interval"] == 1 and rule["ends"] == "never"
    fifth = normalize_recurrence({"start": "2026-10-29", "repeat": "monthly"})  # 5th Thursday means "last"
    assert fifth["nth"] == -1


def test_repeat_rule_is_clamped_and_cleaned():
    rule = normalize_recurrence(
        {"start": "2026-01-05", "length_days": 9999, "interval": 0, "weekdays": [1, 1, 9, "x", True, 3], "repeat": "weird",
         "by": "weird", "nth": 7, "weekday": 9, "month": 99, "day": 0, "count": -4}
    )
    assert rule["length_days"] == 366 and rule["interval"] == 1 and rule["repeat"] == "none" and rule["by"] == "day"
    assert rule["weekdays"] == [1, 3] and rule["nth"] == 1 and rule["weekday"] == 1  # defaults from the start (a Monday)
    assert rule["month"] == 12 and rule["day"] == 1 and rule["count"] == 1


def test_repeat_rule_rejects_bad_dates_and_end_rules():
    for bad in ("", "2026-02-30", "Oct 31", "10-31", None, 5):
        with pytest.raises(ValueError):
            normalize_recurrence({"start": bad})
    with pytest.raises(ValueError):
        normalize_recurrence("not a dict")
    with pytest.raises(ValueError):
        normalize_recurrence({"start": "2026-10-01", "ends": "on"})  # needs an end date
    with pytest.raises(ValueError):
        normalize_recurrence({"start": "2026-10-01", "ends": "on", "until": "2026-09-01"})
    assert normalize_recurrence({"start": "2026-10-01", "ends": "on", "until": "2027-01-01"})["until"] == "2027-01-01"


def test_date_trigger_needs_a_repeat_rule_and_keeps_it():
    with pytest.raises(ValueError):
        normalize_trigger({"type": "date"})
    trig = normalize_trigger({"type": "date", "recurrence": {"start": "2026-12-20", "length_days": 5, "repeat": "yearly"}})
    assert trig["recurrence"]["length_days"] == 5 and "date" not in trig


def test_first_draft_date_triggers_are_converted():
    halloween = legacy_to_recurrence({"date": "10-15", "end_date": "10-31", "repeat_yearly": True})
    assert (halloween["start"], halloween["length_days"], halloween["repeat"]) == ("2000-10-15", 17, "yearly")
    across = legacy_to_recurrence({"date": "12-28", "end_date": "01-03", "repeat_yearly": True})
    assert across["length_days"] == 7
    lead = legacy_to_recurrence({"date": "12-20", "end_date": "12-25", "lead_days": 3})
    assert (lead["start"], lead["length_days"]) == ("2000-12-17", 9)
    once = legacy_to_recurrence({"date": "2026-05-01", "repeat_yearly": False})
    assert once["repeat"] == "none" and once["start"] == "2026-05-01"
    assert normalize_trigger({"type": "date", "date": "02-29"})["recurrence"]["start"] == "2000-02-29"
    for bad in ("02-30", "13-01", "Oct 31", "", "2026-02-29"):
        with pytest.raises(ValueError):
            normalize_trigger({"type": "date", "date": bad})
    with pytest.raises(ValueError):
        normalize_trigger({"type": "date", "date": "10-01", "end_date": "nope"})


def test_scene_needs_a_name_and_a_rule_and_cleans_its_items():
    rule = {"start": "2026-10-15", "length_days": 17, "repeat": "yearly"}
    scene = normalize_scene({"name": "Halloween", "recurrence": rule, "item_ids": ["a", "a", "b", 5, ""]}, None, 3)
    assert scene["item_ids"] == ["a", "b"] and scene["enabled"] is True and scene["running"] is False and scene["order"] == 3
    with pytest.raises(ValueError):
        normalize_scene({"name": "", "recurrence": rule}, None, 1)
    with pytest.raises(ValueError):
        normalize_scene({"name": "x"}, None, 1)
    again = normalize_scene({"name": "Halloween 2", "recurrence": rule, "running": True}, scene, 9)
    assert again["id"] == scene["id"] and again["order"] == 3 and again["running"] is False  # running is only set by Run now


def test_trigger_keeps_pause_flag():
    assert normalize_trigger({"type": "manual", "enabled": False})["enabled"] is False
    assert normalize_trigger({"type": "manual"})["enabled"] is True


def test_popup_and_decoration_defaults():
    popup = normalize_item({"kind": "popup", "name": "p", "frequency": {"value": 30, "unit": "seconds"}}, None, 1)
    assert popup["frequency"] == {"value": 30, "unit": "seconds"}
    assert popup["repeat_mode"] == "repeat"
    deco = normalize_item({"kind": "decoration", "name": "d", "opacity": 7}, None, 1)
    assert deco["opacity"] == 1
    assert "path" not in deco
    # top left is where menus are, so a new decoration starts at the top right
    assert deco["placements"] == [{"anchor": "top_right", "offset_px": {"x": 0, "y": 0}, "flip": True, "size_px": None}]
    assert "anchor" not in deco and "mirror" not in deco and "repeat_along_edge" not in deco


def test_decoration_placements():
    legacy = normalize_item({"kind": "decoration", "name": "d", "anchor": "bottom_left", "offset_px": {"x": 5, "y": 7}, "mirror": False}, None, 1)
    assert legacy["placements"] == [{"anchor": "bottom_left", "offset_px": {"x": 5, "y": 7}, "flip": False, "size_px": None}]
    many = normalize_item({"kind": "decoration", "name": "d", "placements": [{"anchor": a} for a in ["top_left", "bottom_right", "nonsense"]] * 20}, None, 1)
    assert len(many["placements"]) == 40
    assert many["placements"][2]["anchor"] == "top_right"
    assert normalize_item({"kind": "decoration", "name": "d", "placements": []}, None, 1)["placements"]


def test_scale_setting():
    assert normalize_settings({})["scale"] == 100
    assert normalize_settings({"scale": 5})["scale"] == 25
    assert normalize_settings({"scale": 999})["scale"] == 400
    assert normalize_settings({"scale": 150})["scale"] == 150


def test_settings_clamp():
    s = normalize_settings({"max_simultaneous": 99, "default_dashboards": ["/a", "bad", "/a"]})
    assert s["max_simultaneous"] == 10
    assert s["default_dashboards"] == ["/a"]


async def test_first_run_seeds_starter_items(hass):
    store = PopupStore(hass)
    await store.async_load()
    by_name = {i["name"]: i for i in store.items}
    assert len(by_name) == len(store.items)  # names are unique
    assert [i["order"] for i in store.items] == list(range(1, len(store.items) + 1))
    assert store.items[0]["order"] == 1 and store._data["next_order"] == len(store.items) + 1
    witch = by_name["Flying witch"]
    assert witch["image"]["builtin"] is True and witch["enabled"] is True
    rule = witch["triggers"][0]["recurrence"]
    assert (rule["start"], rule["length_days"], rule["repeat"]) == ("2000-10-15", 17, "yearly")
    # only the Halloween, Thanksgiving and Christmas packs start on
    on = {i["name"] for i in store.items if i["enabled"]}
    assert "Running turkey" in on and "Flying Santa" in on and "Mummy popup" in on
    assert "Mail popup" not in on and "Menorah" not in on and "Rain umbrella" not in on


def test_seed_art_matches_defaults_folder():
    import pathlib

    from custom_components.dashboard_holiday_popups.seed import seed_items

    folder = pathlib.Path(__file__).parent.parent / "custom_components" / "dashboard_holiday_popups" / "defaults"
    shipped = {p.name for p in folder.iterdir()}
    used = {raw["image"]["file"] for raw in seed_items()}
    assert used <= shipped, f"missing art: {used - shipped}"
    assert shipped <= used, f"unused art: {shipped - used}"
    for name in shipped:
        assert name == name.lower() and " " not in name


def test_seed_triggers_and_text_art():
    from custom_components.dashboard_holiday_popups.seed import seed_items
    from custom_components.dashboard_holiday_popups.storage import builtin_items

    items = {i["name"]: i for i in builtin_items()}
    assert len(items) == len(seed_items())
    # entity packs are paused with no trigger; weather packs carry a blank-entity weather trigger
    for name in ("Mail popup", "Washer popup", "Package popup", "Mail flying"):
        assert items[name]["enabled"] is False and items[name]["triggers"] == []
    for name in ("Rain umbrella", "Shoveling snow", "Snow blower"):
        trig = items[name]["triggers"][0]
        assert trig["type"] == "weather" and trig["entity_id"] == "" and trig["conditions"]
    # art with words baked in must never be mirrored
    for name in ("Eid al-Adha", "Labor Day banner", "Mail flying"):
        assert items[name]["direction"] == "left_to_right"
    # movable holidays use the widest range the day can fall in
    turkey = items["Running turkey"]["triggers"][0]["recurrence"]
    assert (turkey["start"], turkey["length_days"]) == ("2000-11-22", 7)


async def test_save_find_delete(hass):
    store = PopupStore(hass)
    await store.async_load()
    events = []
    store.add_listener(events.append)
    before = len(store.items)
    item = await store.async_save_item({"kind": "popup", "name": "Mail", "image": {"file": "mail-12345678.gif"}})
    assert store.find_item("mail")["id"] == item["id"]
    again = await store.async_save_item({**item, "name": "Mail 2"})
    assert again["id"] == item["id"] and len(store.items) == before + 1
    assert "mail-12345678.gif" in store.referenced_files()
    assert await store.async_delete_item(item["id"])
    assert "mail-12345678.gif" not in store.referenced_files()
    assert all(e["type"] == "config" for e in events)


async def test_run_now_is_saved_and_never_comes_from_an_edit(hass):
    store = PopupStore(hass)
    await store.async_load()
    item = store.find_item("Menorah")
    assert item["running"] is False
    assert await store.async_set_running(item["id"], True)
    edited = await store.async_save_item({**item, "running": False, "name": "Menorah"})
    assert edited["running"] is True  # the edit form cannot clear it
    assert await store.async_stop_all() == 1
    assert store.find_item("Menorah")["running"] is False
    assert await store.async_stop_all() == 0
    assert not await store.async_set_running("nope", True)


async def test_scenes_save_validate_and_clean_up(hass):
    store = PopupStore(hass)
    await store.async_load()
    menorah, rain = store.find_item("Menorah"), store.find_item("Rain umbrella")
    rule = {"start": "2026-12-20", "length_days": 5, "repeat": "yearly"}
    scene = await store.async_save_scene({"name": "Hanukkah week", "recurrence": rule, "item_ids": [menorah["id"]]})
    assert scene["item_ids"] == [menorah["id"]] and store.scenes_containing(menorah["id"]) == [scene]
    assert store.config_payload()["scenes"] == [scene]
    with pytest.raises(ValueError, match="sensor"):
        await store.async_save_scene({"name": "Bad", "recurrence": rule, "item_ids": [rain["id"]]})
    with pytest.raises(ValueError, match="no longer exists"):
        await store.async_save_scene({"name": "Bad", "recurrence": rule, "item_ids": ["ghost"]})
    # an item in a scene cannot be given a sensor trigger
    with pytest.raises(ValueError, match="Hanukkah week"):
        await store.async_save_item({**menorah, "triggers": [{"type": "weather", "entity_id": "weather.home", "conditions": ["rainy"]}]})
    # run, pause, rename in place, then delete the item and the scene
    assert await store.async_set_scene_running(scene["id"], True) and store.find_scene(scene["id"])["running"] is True
    assert await store.async_set_scene_enabled(scene["id"], False)
    renamed = await store.async_save_scene({**scene, "name": "Eight nights"})
    assert renamed["id"] == scene["id"] and renamed["running"] is True and len(store.scenes) == 1
    assert await store.async_stop_all() == 1
    assert await store.async_delete_item(menorah["id"])
    assert store.find_scene(scene["id"])["item_ids"] == []
    assert await store.async_delete_scene(scene["id"]) and not await store.async_delete_scene(scene["id"])


async def test_disable_all_can_target_ids(hass):
    store = PopupStore(hass)
    await store.async_load()
    two = [i["id"] for i in store.items if i["enabled"]][:2]
    assert await store.async_disable_all(item_ids=two) == 2
    assert all(not store.find_item(i)["enabled"] for i in two)


async def test_scenes_survive_a_restart_and_lose_deleted_items(hass):
    store = PopupStore(hass)
    await store.async_load()
    menorah = store.find_item("Menorah")
    rule = {"start": "2026-12-20", "length_days": 5, "repeat": "yearly"}
    scene = await store.async_save_scene({"name": "A", "recurrence": rule, "item_ids": [menorah["id"]]})
    await store.async_set_running(menorah["id"], True)
    again = PopupStore(hass)
    await again.async_load()
    assert again.find_scene(scene["id"])["item_ids"] == [menorah["id"]]
    assert again.find_item("Menorah")["running"] is True


def test_push_away_setting_defaults_and_choices():
    floater = normalize_item({"kind": "floater", "name": "w"}, None, 1)
    assert floater["drag_off"] == {"enabled": True, "action": "delay", "away_seconds": 60}
    popup = normalize_item({"kind": "popup", "name": "p"}, None, 1)
    assert popup["drag_off"] == {"enabled": False, "action": "delay", "away_seconds": 60}
    off = normalize_item({"kind": "popup", "name": "p", "drag_off": {"enabled": True, "action": "off"}}, None, 1)
    assert off["drag_off"]["enabled"] and off["drag_off"]["action"] == "off"
    bad = normalize_item({"kind": "floater", "name": "w", "drag_off": {"action": "explode", "away_seconds": 99999}}, None, 1)
    assert bad["drag_off"]["action"] == "delay" and bad["drag_off"]["away_seconds"] == 3600
    assert "drag_off" not in normalize_item({"kind": "decoration", "name": "d"}, None, 1)


def test_muted_is_never_taken_from_the_edit_form():
    first = normalize_item({"kind": "floater", "name": "w", "muted": {"s1": "2026-10-15"}}, None, 1)
    assert first["muted"] == {}
    kept = normalize_item({"kind": "floater", "name": "w", "muted": {}}, {**first, "muted": {"s1": "2026-10-15"}}, 1)
    assert kept["muted"] == {"s1": "2026-10-15"}


def test_placement_size_is_optional():
    item = normalize_item({"kind": "decoration", "name": "d", "placements": [
        {"anchor": "top_left"}, {"anchor": "bottom_left", "size_px": 150}, {"anchor": "top_right", "size_px": 9999}, {"anchor": "bottom_right", "size_px": ""}]}, None, 1)
    assert [p["size_px"] for p in item["placements"]] == [None, 150, 1600, None]


def test_popup_edge_settings():
    assert normalize_settings({})["popup_default_edge"] == "left"
    assert normalize_settings({"popup_default_edge": "top"})["popup_default_edge"] == "top"
    assert normalize_settings({"popup_default_edge": "sideways"})["popup_default_edge"] == "left"
    assert normalize_item({"kind": "popup", "name": "p"}, None, 1)["drawn_for"] == "bottom"
    assert normalize_item({"kind": "popup", "name": "p", "drawn_for": "left"}, None, 1)["drawn_for"] == "left"
    assert normalize_item({"kind": "popup", "name": "p", "drawn_for": "up"}, None, 1)["drawn_for"] == "bottom"


def test_starter_mummy_comes_from_the_left_and_the_other_popups_from_the_bottom():
    from custom_components.dashboard_holiday_popups.seed import seed_items

    popups = {i["name"]: normalize_item(i, None, 1) for i in seed_items() if i["kind"] == "popup"}
    assert popups["Mummy popup"]["anchor"] == "left" and popups["Mummy popup"]["drawn_for"] == "left"
    assert all(p["anchor"] == "bottom" and p["drawn_for"] == "bottom" for n, p in popups.items() if n != "Mummy popup")


def test_popup_can_come_from_two_opposite_edges():
    for anchor in ("left_right", "top_bottom", "random", "left"):
        assert normalize_item({"kind": "popup", "name": "p", "anchor": anchor}, None, 1)["anchor"] == anchor
    assert normalize_item({"kind": "popup", "name": "p", "anchor": "diagonal"}, None, 1)["anchor"] == "bottom"
