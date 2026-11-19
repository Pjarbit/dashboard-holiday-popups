"""Config flow for Dashboard Holiday Popups."""
# Integration version: 1.0.6
from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.config_entries import ConfigFlow, ConfigFlowResult, OptionsFlow
from homeassistant.core import callback

from .const import DOMAIN


class DashboardHolidayPopupsConfigFlow(ConfigFlow, domain=DOMAIN):
    """One instance only. All real editing happens in the settings panel."""

    VERSION = 1

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        await self.async_set_unique_id(DOMAIN)
        self._abort_if_unique_id_configured()
        if user_input is not None:
            return self.async_create_entry(title="Dashboard Holiday Popups", data={})
        return self.async_show_form(step_id="user")

    @staticmethod
    @callback
    def async_get_options_flow(config_entry) -> OptionsFlow:
        return DashboardHolidayPopupsOptionsFlow()


class DashboardHolidayPopupsOptionsFlow(OptionsFlow):
    """Only the master switch and the default dashboards live here."""

    async def async_step_init(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        from . import get_store  # local import: the store only exists while loaded

        store = get_store(self.hass)
        if store is None:
            return self.async_abort(reason="not_loaded")
        if user_input is not None:
            dashboards = [
                part.strip()
                for part in user_input.get("default_dashboards", "").replace(",", "\n").splitlines()
                if part.strip()
            ]
            await store.async_save_settings(
                {"enabled": user_input["enabled"], "default_dashboards": dashboards}
            )
            return self.async_create_entry(data={})
        current = store.settings
        schema = vol.Schema(
            {
                vol.Required("enabled", default=current["enabled"]): bool,
                vol.Optional(
                    "default_dashboards", default="\n".join(current["default_dashboards"])
                ): str,
            }
        )
        return self.async_show_form(step_id="init", data_schema=schema)
