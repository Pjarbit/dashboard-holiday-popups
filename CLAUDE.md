# Rules for Claude

## manifest.json — DO NOT EDIT

Never edit `custom_components/dashboard_holiday_popups/manifest.json` except the `"version"` value. Do not add, remove, rename, reorder or reformat anything else in that file. Home Assistant requires a specific key order (`domain`, `name`, then the rest alphabetically).

## Version bumps

Every bump must update ALL version references, including the `pja` stamp comments. Run `python3 scripts/check_versions.py` before and after: it lists every reference and exits non-zero if any differ. Never add `?v=` query strings and never tell users to clear their cache; each release is served from a new URL path (`/dashboard_holiday_popups_static/<version>/`) and uploaded images get content-hash file names.

## Home Assistant YAML

Use `action: perform-action` style (`action:` with `target:` / `data:`), never `call-service`. Give whole cards and show old → new for changes.
