# Dashboard Holiday Popups

Animated characters, timed popups and decorations that float over your Home Assistant dashboards, set up from one settings panel. Great for holidays and birthdays, but just as useful for **mail and package deliveries, washer and dryer done, weather, or anything else** an entity can tell you.

- **Characters** walk along the bottom or top, drift, bob, sway, circle, or fly a curved or zigzag path. Push one off the screen with a finger and it either comes back after a delay you choose, or turns itself off. You can pause it for a selected amount of time or just turn it off completely.
- **Popups** peek in from an edge on their own timer (a chosen edge, left or right at random, top or bottom at random, or any edge; a picture drawn for the left or right side is mirrored, not turned over, when it comes from the other side, while top and bottom pictures turn upside down), with an optional text banner. They never land on top of each other. You can let a finger push one back off the screen, with the same delay or turn-off choice.
- **Decorations** sit in corners or along edges (wreaths, lights). One picture can be placed in as many corners as you like, each flipped to fit. They are click-through.
- **Dates** work like a calendar: a start date, how many days it lasts, and a repeat (daily, weekly on chosen days, monthly, yearly, every N, ending never / on a date / after N times). Thanksgiving is "yearly, the 4th Thursday of November"; Santa can start December 20 for 5 days.
- **Scenes** switch a group of dated items on together on one schedule, such as Halloween.
- **Weather and Sensors**: weather and any entity state show items on their own screen.
- **Run now / Stop** shows any item or scene until you stop it. It is saved, so it survives a page refresh and a restart.
- **Controls**: a switch entity for the master switch, each scene, and each item you add (the starter items' switches are hidden until you enable them in the entity settings), plus services for automations.

## Install

1. HACS → Integrations → three dots → Custom repositories → add `https://github.com/Pjarbit/dashboard-holiday-popups` as *Integration*, then download it.
2. Restart Home Assistant.
3. Settings → Devices & services → Add integration → **Dashboard Holiday Popups**.
4. Open **Holiday Popups** in the sidebar (administrators only).
5. After you have finished installing and making your changes, **refresh your screen** (reload the dashboard page).

If you don't want it in the sidebar, you can hide the entry in Home Assistant and still reach the settings by going to `/dashboard-holiday-popups` after your Home Assistant address, for example `http://homeassistant.local:8123/dashboard-holiday-popups`. Bookmark it, or use that path as a navigation button on a dashboard. It is still administrators only.

Requires Home Assistant 2024.12.0 or newer.

# ⚠️ Make sure you refresh your screen to get the characters animated ⚠️

## Using it

The panel has four screens:

- **Dated or Manual**: items that show on dates, or all the time, and the place to turn things on by hand. Press **Add Custom Character**, **Add Custom Popup** or **Add Custom Decoration**, name it, upload an image, choose how it moves and when it shows. A birthday is a good example: you don't want a date to start it automatically, so leave its dates empty and press **Run now** on the day. It shows until you press **Stop**. The same works for a holiday: on Valentine's Day, press **Run now** on a whole scene, or on just the individual characters, popups and decorations you want.
- **Scenes**: pick a name, a repeat rule and the items to include. A scene controls only *when* its items show (schedule, Run now, on/off switch). How an item looks and moves (size, path, speed, image, dashboards, pushing aside) is always set on the item itself, never on the scene. While a scene is on, it decides for its items: their own switches are locked and the card says "On via scene". When the scene is off, each item works on its own again with its own switch and dates. Adding an item to a scene turns its own switch off, so switch it back on if you want it on its own. An item can be in several scenes and shows when any of them is on. A scene has one repeat rule, so make one scene per person or season: press **Duplicate** on a scene, then change its name, date and the optional **Name shown in banners**, which fills `{name}` in a popup's banner text while that scene shows it. **Duplicate** on an item makes a copy to change (a second witch with another path and speed, say).
- **Weather and Sensors**: items triggered by a weather entity or any other entity. Weather and sensor items cannot join a scene.
- **Settings**: master switch, how many show at once, layer, **Scale** (a percent that makes every character, popup and decoration bigger or smaller on all devices; 100 is normal), default dashboards, and the reduced-motion option.

**Run now** on an item or scene shows it right away and keeps it showing until you press **Stop** (a popup shows at once and then repeats on its normal timer). **Stop all** ends everything you started. **Turn all off** pauses every item on the current screen; there is no turn-all-on. Run now respects the cap in Settings.

### Starter set

About 60 starter items come with the integration and are created the first time you add it:

- **On from the start:** Halloween (Oct 15 to 31), Thanksgiving (Nov 22 to 28, which always includes the 4th Thursday) and Christmas (Dec 1 to 26).
- **Paused, with a date:** Groundhog Day, Valentine's Day, New Year's, Mother's Day, Father's Day, Fourth of July, Labor Day and Veterans Day. Mother's Day, Father's Day and Labor Day use the widest week the day can fall in.
- **Paused, you set the dates:** birthdays, Easter, graduation, Eid, Ramadan, Hanukkah, Yahrzeit, Lunar New Year, Vaisakhi and Vesak. Open the item, add a date trigger and switch it on.
- **Paused, you choose the entity:** washer, mail and package items, plus rain and snow (choose your weather entity and conditions).

Every item can be edited, paused or deleted. Switch off the ones you don't want from the Dated or Manual and Weather and Sensors screens, or use Turn all off.

### Gallery of the starter pictures

Every starter item, grouped by holiday. The pictures animate on GitHub. Each heading says whether the group is on from the start or paused, and what you need to add before it will show.

#### Halloween (on from the start, except the whimsical cobweb, which is paused)

| Picture | Name | Type |
|---|---|---|
| <img src="custom_components/dashboard_holiday_popups/defaults/spooky-cobweb.png" height="90" alt="Spooky cobweb"> | Spooky cobweb | Decoration |
| <img src="custom_components/dashboard_holiday_popups/defaults/whimsical-cobweb.png" height="90" alt="Whimsical cobweb"> | Whimsical cobweb | Decoration |
| <img src="custom_components/dashboard_holiday_popups/defaults/witch-flying.webp" height="90" alt="Flying witch"> | Flying witch | Character |
| <img src="custom_components/dashboard_holiday_popups/defaults/flying-ghost-scary.gif" height="90" alt="Scary ghost"> | Scary ghost | Character |
| <img src="custom_components/dashboard_holiday_popups/defaults/flying-ghosts-funny.gif" height="90" alt="Funny ghosts"> | Funny ghosts | Character |
| <img src="custom_components/dashboard_holiday_popups/defaults/frankie-walking-2.gif" height="90" alt="Frankenstein walking"> | Frankenstein walking | Character |
| <img src="custom_components/dashboard_holiday_popups/defaults/frankie-walking.gif" height="90" alt="Frankenstein walking 2"> | Frankenstein walking 2 | Character |
| <img src="custom_components/dashboard_holiday_popups/defaults/walking-bats.gif" height="90" alt="Bats"> | Bats | Character |
| <img src="custom_components/dashboard_holiday_popups/defaults/frankie-popup.gif" height="90" alt="Frankenstein popup"> | Frankenstein popup | Popup |
| <img src="custom_components/dashboard_holiday_popups/defaults/popup-mummy.webp" height="90" alt="Mummy popup"> | Mummy popup | Popup |

#### Thanksgiving (on from the start)

| Picture | Name | Type |
|---|---|---|
| <img src="custom_components/dashboard_holiday_popups/defaults/autumn-pumpkin-corner.png" height="90" alt="Autumn pumpkins"> | Autumn pumpkins | Decoration |
| <img src="custom_components/dashboard_holiday_popups/defaults/running-turkey.gif" height="90" alt="Running turkey"> | Running turkey | Character |
| <img src="custom_components/dashboard_holiday_popups/defaults/popup-turkey.gif" height="90" alt="Turkey popup"> | Turkey popup | Popup |

#### Christmas (on from the start)

| Picture | Name | Type |
|---|---|---|
| <img src="custom_components/dashboard_holiday_popups/defaults/corner-xmas.png" height="90" alt="Christmas corner"> | Christmas corner | Decoration |
| <img src="custom_components/dashboard_holiday_popups/defaults/flying-santa.gif" height="90" alt="Flying Santa"> | Flying Santa | Character |
| <img src="custom_components/dashboard_holiday_popups/defaults/popup-santa.gif" height="90" alt="Santa popup"> | Santa popup | Popup |

#### Birthday (paused, you set the dates)

| Picture | Name | Type |
|---|---|---|
| <img src="custom_components/dashboard_holiday_popups/defaults/birthday-cake-walking.gif" height="90" alt="Birthday cake walking"> | Birthday cake walking | Character |
| <img src="custom_components/dashboard_holiday_popups/defaults/birthday-boy-popup.webp" height="90" alt="Birthday boy popup"> | Birthday boy popup | Popup |
| <img src="custom_components/dashboard_holiday_popups/defaults/birthday-girl-popup.gif" height="90" alt="Birthday girl popup"> | Birthday girl popup | Popup |
| <img src="custom_components/dashboard_holiday_popups/defaults/birthday-kids-popup.gif" height="90" alt="Birthday kids popup"> | Birthday kids popup | Popup |

#### Easter (paused, you set the dates)

| Picture | Name | Type |
|---|---|---|
| <img src="custom_components/dashboard_holiday_popups/defaults/bouncing-easter-bunny.gif" height="90" alt="Bouncing Easter bunny"> | Bouncing Easter bunny | Character |
| <img src="custom_components/dashboard_holiday_popups/defaults/hopping-easter-bunny.gif" height="90" alt="Hopping Easter bunny"> | Hopping Easter bunny | Character |
| <img src="custom_components/dashboard_holiday_popups/defaults/popup-easter-bunny.gif" height="90" alt="Easter bunny popup"> | Easter bunny popup | Popup |

#### Groundhog Day (paused, dates already set)

| Picture | Name | Type |
|---|---|---|
| <img src="custom_components/dashboard_holiday_popups/defaults/walking-groundhog.gif" height="90" alt="Groundhog walking"> | Groundhog walking | Character |
| <img src="custom_components/dashboard_holiday_popups/defaults/popup-groundhog.gif" height="90" alt="Groundhog popup"> | Groundhog popup | Popup |

#### Valentine's Day (paused, dates already set)

| Picture | Name | Type |
|---|---|---|
| <img src="custom_components/dashboard_holiday_popups/defaults/flying-cupid.gif" height="90" alt="Flying cupid"> | Flying cupid | Character |
| <img src="custom_components/dashboard_holiday_popups/defaults/popup-cupid.gif" height="90" alt="Cupid popup"> | Cupid popup | Popup |

#### New Year's (paused, dates already set)

| Picture | Name | Type |
|---|---|---|
| <img src="custom_components/dashboard_holiday_popups/defaults/walking-newyears.gif" height="90" alt="New Year's walking"> | New Year's walking | Character |
| <img src="custom_components/dashboard_holiday_popups/defaults/fireworks.gif" height="90" alt="Fireworks"> | Fireworks | Character |

#### Mother's Day (paused, dates already set)

| Picture | Name | Type |
|---|---|---|
| <img src="custom_components/dashboard_holiday_popups/defaults/popup-mothers-day.gif" height="90" alt="Mother's Day popup"> | Mother's Day popup | Popup |

#### Father's Day (paused, dates already set)

| Picture | Name | Type |
|---|---|---|
| <img src="custom_components/dashboard_holiday_popups/defaults/floating-fathers-day.gif" height="90" alt="Father's Day banner"> | Father's Day banner | Character |
| <img src="custom_components/dashboard_holiday_popups/defaults/popup-fathers-day.webp" height="90" alt="Father's Day popup"> | Father's Day popup | Popup |

#### Fourth of July (paused, dates already set)

| Picture | Name | Type |
|---|---|---|
| <img src="custom_components/dashboard_holiday_popups/defaults/walking-uncle-sam.webp" height="90" alt="Uncle Sam walking"> | Uncle Sam walking | Character |
| <img src="custom_components/dashboard_holiday_popups/defaults/popup-uncle-sam.webp" height="90" alt="Uncle Sam popup"> | Uncle Sam popup | Popup |

#### Labor Day (paused, dates already set)

| Picture | Name | Type |
|---|---|---|
| <img src="custom_components/dashboard_holiday_popups/defaults/moving-labor-day.gif" height="90" alt="Labor Day banner"> | Labor Day banner | Character |

#### Veterans Day (paused, dates already set)

| Picture | Name | Type |
|---|---|---|
| <img src="custom_components/dashboard_holiday_popups/defaults/walking-soldiers.gif" height="90" alt="Veterans soldiers"> | Veterans soldiers | Character |
| <img src="custom_components/dashboard_holiday_popups/defaults/walking-soldiers-in-a-line.gif" height="90" alt="Veterans soldiers in a line"> | Veterans soldiers in a line | Character |
| <img src="custom_components/dashboard_holiday_popups/defaults/popup-soldier.gif" height="90" alt="Soldier popup"> | Soldier popup | Popup |

#### Graduation (paused, you set the dates)

| Picture | Name | Type |
|---|---|---|
| <img src="custom_components/dashboard_holiday_popups/defaults/graduates-walking.gif" height="90" alt="Graduates walking"> | Graduates walking | Character |
| <img src="custom_components/dashboard_holiday_popups/defaults/graduates-popup.gif" height="90" alt="Graduates popup"> | Graduates popup | Popup |

#### Eid (paused, you set the dates)

| Picture | Name | Type |
|---|---|---|
| <img src="custom_components/dashboard_holiday_popups/defaults/eid-al-adha.gif" height="90" alt="Eid al-Adha"> | Eid al-Adha | Character |
| <img src="custom_components/dashboard_holiday_popups/defaults/eid-al-fitr.gif" height="90" alt="Eid al-Fitr"> | Eid al-Fitr | Character |

#### Ramadan (paused, you set the dates)

| Picture | Name | Type |
|---|---|---|
| <img src="custom_components/dashboard_holiday_popups/defaults/ramadan-lantern.gif" height="90" alt="Ramadan lantern"> | Ramadan lantern | Character |

#### Hanukkah (paused, you set the dates)

| Picture | Name | Type |
|---|---|---|
| <img src="custom_components/dashboard_holiday_popups/defaults/moving-menorah.gif" height="90" alt="Menorah"> | Menorah | Character |
| <img src="custom_components/dashboard_holiday_popups/defaults/moving-dreidel.gif" height="90" alt="Dreidel"> | Dreidel | Character |
| <img src="custom_components/dashboard_holiday_popups/defaults/spinning-dreidel.gif" height="90" alt="Spinning dreidel"> | Spinning dreidel | Character |

#### Yahrzeit (paused, you set the dates)

| Picture | Name | Type |
|---|---|---|
| <img src="custom_components/dashboard_holiday_popups/defaults/yartzeit-candle.gif" height="90" alt="Yahrzeit candle"> | Yahrzeit candle | Character |

#### Lunar New Year (paused, you set the dates)

| Picture | Name | Type |
|---|---|---|
| <img src="custom_components/dashboard_holiday_popups/defaults/chinese-ny-dragon.gif" height="90" alt="Chinese New Year dragon"> | Chinese New Year dragon | Character |

#### Vaisakhi (paused, you set the dates)

| Picture | Name | Type |
|---|---|---|
| <img src="custom_components/dashboard_holiday_popups/defaults/drums.gif" height="90" alt="Drums (Vaisakhi)"> | Drums (Vaisakhi) | Character |

#### Vesak (paused, you set the dates)

| Picture | Name | Type |
|---|---|---|
| <img src="custom_components/dashboard_holiday_popups/defaults/lotus-flower.gif" height="90" alt="Lotus flower (Vesak)"> | Lotus flower (Vesak) | Character |

#### Washer (paused, you choose the entity)

| Picture | Name | Type |
|---|---|---|
| <img src="custom_components/dashboard_holiday_popups/defaults/walking-washer.gif" height="90" alt="Washer walking"> | Washer walking | Character |
| <img src="custom_components/dashboard_holiday_popups/defaults/washing-machine-popup.gif" height="90" alt="Washer popup"> | Washer popup | Popup |

#### Mail (paused, you choose the entity)

| Picture | Name | Type |
|---|---|---|
| <img src="custom_components/dashboard_holiday_popups/defaults/mail-flying.gif" height="90" alt="Mail flying"> | Mail flying | Character |
| <img src="custom_components/dashboard_holiday_popups/defaults/walking-mail-no-text.gif" height="90" alt="Mail walking"> | Mail walking | Character |
| <img src="custom_components/dashboard_holiday_popups/defaults/mail-popup.gif" height="90" alt="Mail popup"> | Mail popup | Popup |

#### Package (paused, you choose the entity)

| Picture | Name | Type |
|---|---|---|
| <img src="custom_components/dashboard_holiday_popups/defaults/package-delivery-man.gif" height="90" alt="Package delivery"> | Package delivery | Character |
| <img src="custom_components/dashboard_holiday_popups/defaults/package-popup.gif" height="90" alt="Package popup"> | Package popup | Popup |

#### Weather (paused, you choose the entity)

| Picture | Name | Type |
|---|---|---|
| <img src="custom_components/dashboard_holiday_popups/defaults/walking-rain.webp" height="90" alt="Rain umbrella"> | Rain umbrella | Character |
| <img src="custom_components/dashboard_holiday_popups/defaults/shoveling-snow.gif" height="90" alt="Shoveling snow"> | Shoveling snow | Character |
| <img src="custom_components/dashboard_holiday_popups/defaults/snow-blower.webp" height="90" alt="Snow blower"> | Snow blower | Character |

### Adding your own pictures

Upload them in the panel itself; there is no folder to copy files into.

1. Open **Holiday Popups** in the sidebar.
2. On **Dated or Manual** or **Weather and Sensors**, press **Add Custom Character**, **Add Custom Popup** or **Add Custom Decoration**, or press **Edit** on an existing item.
3. In the **Basics** box, under **Image**, press **Choose file** and pick your GIF, WebP, APNG or PNG (up to 5 MB).
4. Set its size, how it moves and when it shows, then **Save**.

Uploads are stored for you in `/config/dashboard_holiday_popups/`. To swap the picture on an existing item, edit it and choose a new file.

Leave **Dashboards** empty to use the default list from Settings; an empty default list means every dashboard. Settings pages, developer tools and the profile page never show anything.

### Services

| Service | Fields | What it does |
|---|---|---|
| `dashboard_holiday_popups.show_popup` | `item`, `message` (optional), `duration` (optional) | Shows a popup or character for a moment, then it goes away (use Run now in the panel to keep one showing). `item` is the item's name. |
| `dashboard_holiday_popups.hide_all` | none | Hides everything shown right now. |
| `dashboard_holiday_popups.set_enabled` | `item`, `enabled` | Pauses or resumes an item. |

```yaml
actions:
  - action: dashboard_holiday_popups.show_popup
    data:
      item: Package delivered
      message: A package is at the door
```

### Pushing things aside

Characters and popups each have a **When pushed away** setting:

- **Come back after a delay**: it leaves and returns after the number of seconds you set (popups return on their normal timer once the delay is over).
- **Turn it off**: it switches itself off, like its own switch, and stays off until you switch it on. An item in a scene is muted only for the current run of that scene (in every scene that is showing it) and returns with the next one; its card shows "Pushed away for now" with a **Bring back** button. If it was started with Run now, it stops. If the server never confirms, the item comes back after a few seconds.

Characters can be pushed by default; popups are tap-through until you switch pushing on for them. "Turn it off" works from any signed-in user, such as a wall tablet that is not an administrator, and it can only switch an item off.

## Making your images

- Transparent background. Use animated **WebP** if you can (smooth edges); GIF only has on/off transparency, so edges look jagged. GIF, WebP, APNG and PNG up to 5 MB are accepted.
- **One image only.** The character is flipped automatically when it walks the other way, so keep **text and logos out of the art** (they would appear mirrored). Draw it facing right. If your art does have words, set its direction to **Left to right only** so it is never flipped.
- Walking or flying loop only, seamless, feet at the bottom edge. Roughly 200–360 px tall keeps files small.
- Popup art: draw it so its body is cut off at the edge it comes in from. New popups come in from the **left** by default (change this under **New popups start from** in Settings), so draw the character peeking in from the left side. Each popup also has **Picture is drawn for**; if it comes in from a different edge, the integration turns the picture from there. A picture drawn for the bottom turns upside down on the top edge, so keep one edge per character where you can.
- Use your own art or properly licensed art. Protected characters and mascots are not bundled and should not be shared in public.

### Make a picture with an AI assistant

Copy the text below into an AI assistant that can write and run code (for example Claude), then replace the part in square brackets with what you want. Image-only chat tools cannot produce a finished transparent animation on their own, so the assistant needs to be able to run code or use an image-editing tool.

```text
I want a picture for the Home Assistant integration "Dashboard Holiday Popups".
What I want: [describe it, e.g. "a cartoon pumpkin character hopping along",
"a snowman waving", "a wreath for a corner"].
Type: [CHARACTER that moves across the screen | POPUP that peeks in from an edge | DECORATION for a corner].

Requirements:
- Original art only. Do not copy or imitate any existing character, mascot, logo or brand.
- No text, numbers or logos anywhere in the picture (it gets flipped left to right).
- Fully transparent background. Smooth, anti-aliased edges (real alpha, not on/off).
- File format: animated WebP for characters and popups; PNG for decorations.
  If WebP is not possible, use APNG or GIF. Never more than 5 MB; aim for under 500 KB.
- Height about 230 px (width follows). Every frame has the same canvas size.
- CHARACTER: draw it facing RIGHT, feet on the bottom edge of the canvas, and make a
  seamless walking or flying cycle of 8 to 16 frames at 10 to 12 frames per second that
  loops with no jump. No waving or greeting.
- POPUP: draw it peeking in from the LEFT edge of the screen (the body cut off on the
  left side, the character looking into the screen), with a short, seamless loop of 8 to 16
  frames.
- DECORATION: one still picture drawn for the TOP LEFT corner of the screen, with the
  art touching the top and left edges. The integration flips it for other corners.

Steps: build the frames, remove or never draw a background, assemble the animation,
then check that the file has transparency, loops cleanly, and is under 5 MB.
Give me the finished file to download.
```

Then upload the file as described in "Adding your own pictures". If the first try has a rough edge, a white halo or a jump at the loop point, tell the assistant exactly what you see and ask it to fix that.

## Notes

- You can run as many popups and floaters as you want. Each one takes computing power and may slow down your dashboard and your Home Assistant experience. We recommend no more than three, but your results may vary. The cap in Settings (default 3, up to 10) applies to characters and to popups separately. Decorations are not counted.
- If your device is set to reduce motion, characters and popups stay hidden (decorations still show) unless you press Run now. You can turn this off in Settings.
- Uploaded images are stored in `/config/dashboard_holiday_popups/`. Each changed image gets a new name, and each release is served from a new URL, so updates show up without any cache steps.
- The settings panel is plain JavaScript, with no external libraries.
