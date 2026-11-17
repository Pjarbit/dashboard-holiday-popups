# Security Policy

## Requirements

- **Home Assistant 2024.12.0 or newer** (set in `hacs.json`)
- Installed through HACS or by copying `custom_components/dashboard_holiday_popups` into your Home Assistant config folder

## Supported Versions

Only the latest release receives security updates.

## Reporting a Vulnerability

Please do not open a public GitHub issue. Report privately through [GitHub Security Advisories](https://github.com/Pjarbit/dashboard-holiday-popups/security/advisories/new) or email pjarbit@gmail.com, with a description, steps to reproduce and the version affected.

## What the integration does with your data

- Only administrators can change settings, upload images or use the panel; any signed-in user's browser can read the display settings it needs to draw the popups.
- Uploads are limited to GIF, WebP, APNG and PNG (checked by file content, not just name), 5 MB each.
- User text (names, messages, banners) is always drawn as plain text, never as HTML.
