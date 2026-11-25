"""Repeat rules shared by date triggers and scenes.

A rule is a start date, a length in days, and how it repeats (like a calendar
event): never, daily, weekly, monthly or yearly, every N units, on a day of the
month or on the Nth weekday, ending never, on a date, or after N times.

The browser does the date maths (see the "recurrence" block in the runtime
script). Python only checks and completes the rule so bad data never reaches it.
Weekdays use the JavaScript numbering: 0 = Sunday ... 6 = Saturday.
"""
# Integration version: 1.0.9
from __future__ import annotations

from datetime import date, timedelta
import re
from typing import Any

REPEATS = ("none", "daily", "weekly", "monthly", "yearly")
BY_MODES = ("day", "weekday")
ENDS = ("never", "on", "after")
NTHS = (1, 2, 3, 4, -1)

_ISO_RE = re.compile(r"^(\d{4})-(\d{2})-(\d{2})$")


def parse_iso(value: Any) -> date | None:
    """Return the date for YYYY-MM-DD text, or None."""
    if not isinstance(value, str):
        return None
    match = _ISO_RE.match(value.strip())
    if not match:
        return None
    try:
        return date(int(match.group(1)), int(match.group(2)), int(match.group(3)))
    except ValueError:
        return None


def js_weekday(day: date) -> int:
    """Sunday = 0 ... Saturday = 6."""
    return (day.weekday() + 1) % 7


def _int(value: Any, default: int, lo: int, hi: int) -> int:
    try:
        number = int(round(float(value)))
    except (TypeError, ValueError):
        number = default
    return max(lo, min(hi, number))


def normalize_recurrence(raw: Any) -> dict[str, Any]:
    """Validate a repeat rule and fill what is missing from its start date."""
    if not isinstance(raw, dict):
        raise ValueError("repeat rule must be an object")
    start = parse_iso(raw.get("start"))
    if start is None:
        raise ValueError(f"invalid start date: {raw.get('start')!r}")

    repeat = raw.get("repeat") if raw.get("repeat") in REPEATS else "none"
    by = raw.get("by") if raw.get("by") in BY_MODES else "day"
    ends = raw.get("ends") if raw.get("ends") in ENDS else "never"

    weekdays_raw = raw.get("weekdays")
    weekdays = sorted(
        {w for w in weekdays_raw if isinstance(w, int) and not isinstance(w, bool) and 0 <= w <= 6}
        if isinstance(weekdays_raw, list)
        else set()
    ) or [js_weekday(start)]

    nth_default = (start.day - 1) // 7 + 1
    nth = raw.get("nth") if raw.get("nth") in NTHS else (nth_default if nth_default <= 4 else -1)
    weekday = raw.get("weekday") if isinstance(raw.get("weekday"), int) and 0 <= raw.get("weekday") <= 6 else js_weekday(start)

    until_text = ""
    if ends == "on":
        until = parse_iso(raw.get("until"))
        if until is None:
            raise ValueError("an end date is needed when the rule ends on a date")
        if until < start:
            raise ValueError("the end date is before the start date")
        until_text = until.isoformat()

    return {
        "start": start.isoformat(),
        "length_days": _int(raw.get("length_days"), 1, 1, 366),
        "repeat": repeat,
        "interval": _int(raw.get("interval"), 1, 1, 99),
        "weekdays": weekdays,
        "by": by,
        "day": _int(raw.get("day"), start.day, 1, 31),
        "nth": nth,
        "weekday": weekday,
        "month": _int(raw.get("month"), start.month, 1, 12),
        "ends": ends,
        "until": until_text,
        "count": _int(raw.get("count"), 1, 1, 9999),
    }


def _add_year(day: date) -> date:
    try:
        return day.replace(year=day.year + 1)
    except ValueError:  # 29 February
        return day.replace(year=day.year + 1, day=28)


def _legacy_day(text: Any) -> date | None:
    """An old "MM-DD" or "YYYY-MM-DD" value. A missing year becomes 2000, a leap year."""
    if not isinstance(text, str):
        return None
    text = text.strip()
    return parse_iso(text) or parse_iso(f"2000-{text}")


def legacy_to_recurrence(raw: dict[str, Any]) -> dict[str, Any]:
    """Convert the first-draft date trigger (date, end_date, repeat_yearly, lead_days)."""
    first = _legacy_day(raw.get("date"))
    if first is None:
        raise ValueError(f"invalid date: {raw.get('date')!r}")
    last = _legacy_day(raw.get("end_date")) if raw.get("end_date") else None
    if raw.get("end_date") and last is None:
        raise ValueError(f"invalid end date: {raw.get('end_date')!r}")
    lead = _int(raw.get("lead_days"), 0, 0, 60)
    yearly = raw.get("repeat_yearly") is not False
    if last is not None and last < first and yearly:
        last = _add_year(last)  # a range that crosses New Year
    length = ((last - first).days + 1 if last is not None else 1) + lead
    start = first - timedelta(days=lead)
    return normalize_recurrence(
        {
            "start": start.isoformat(),
            "length_days": min(length, 366),
            "repeat": "yearly" if yearly else "none",
        }
    )
