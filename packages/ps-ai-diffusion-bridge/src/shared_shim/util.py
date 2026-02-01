"""Minimal Qt-less helpers used by shared modules."""
from __future__ import annotations

import logging
import statistics
from typing import Iterable, Optional, Sequence, TypeVar

T = TypeVar("T")


client_logger = logging.getLogger("shared_shim")
client_logger.addHandler(logging.NullHandler())


def ensure(value: Optional[T], msg: str = "") -> T:
    """Return value if not None, otherwise raise."""
    assert value is not None, msg or "a value is required"
    return value


def clamp(value: int, min_value: int, max_value: int) -> int:
    """Clamp value to [min_value, max_value]."""
    return max(min(value, max_value), min_value)


def median_or_zero(values: Iterable[float]) -> float:
    """Return median or 0 for empty input."""
    try:
        return statistics.median(values)
    except statistics.StatisticsError:
        return 0.0


def _is_number(value: object) -> bool:
    return isinstance(value, (int, float))


def base_type_match(a, b) -> bool:
    """Match by exact type or numeric compatibility."""
    return type(a) is type(b) or (_is_number(a) and _is_number(b))


def unique(seq: Sequence[T], key) -> list[T]:
    """Return unique items preserving order."""
    seen = set()
    result: list[T] = []
    for item in seq:
        k = key(item)
        if k in seen:
            continue
        seen.add(k)
        result.append(item)
    return result
