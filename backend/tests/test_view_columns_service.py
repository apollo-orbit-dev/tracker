"""Unit tests for view_columns service — the column-key validator
and orphan-stripping logic.
"""
import uuid

import pytest

from backend.app.services.view_columns import (
    BUILTIN_COLUMN_KEYS,
    SORTABLE_BUILTIN_KEYS,
    ValidationError,
    parse_column_key,
    strip_orphans,
    validate_columns,
    validate_sort,
)


def test_parse_builtin() -> None:
    assert parse_column_key("builtin:title") == ("builtin", "title", None)


def test_parse_custom_field() -> None:
    fid = uuid.uuid4()
    assert parse_column_key(f"custom_field:{fid}") == (
        "custom_field",
        str(fid),
        None,
    )


def test_parse_milestone_single() -> None:
    mid = uuid.uuid4()
    assert parse_column_key(f"milestone:{mid}:date") == (
        "milestone",
        str(mid),
        "date",
    )


def test_parse_milestone_planned() -> None:
    mid = uuid.uuid4()
    assert parse_column_key(f"milestone:{mid}:planned") == (
        "milestone",
        str(mid),
        "planned",
    )


def test_parse_milestone_actual() -> None:
    mid = uuid.uuid4()
    assert parse_column_key(f"milestone:{mid}:actual") == (
        "milestone",
        str(mid),
        "actual",
    )


def test_parse_invalid_regex() -> None:
    assert parse_column_key("garbage") is None
    assert parse_column_key("builtin:DOES_NOT_EXIST") is None
    assert parse_column_key("custom_field:not-a-uuid") is None
    assert parse_column_key(f"milestone:{uuid.uuid4()}:badmode") is None


def test_validate_columns_rejects_duplicates() -> None:
    with pytest.raises(ValidationError, match="duplicate"):
        validate_columns(
            ["builtin:title", "builtin:title"],
            live_custom_field_ids=set(),
            live_milestone_def_ids=set(),
        )


def test_validate_columns_rejects_unknown_custom_field() -> None:
    with pytest.raises(ValidationError, match="not in this template"):
        validate_columns(
            [f"custom_field:{uuid.uuid4()}"],
            live_custom_field_ids=set(),
            live_milestone_def_ids=set(),
        )


def test_validate_columns_rejects_unknown_milestone() -> None:
    with pytest.raises(ValidationError, match="not in this template"):
        validate_columns(
            [f"milestone:{uuid.uuid4()}:planned"],
            live_custom_field_ids=set(),
            live_milestone_def_ids=set(),
        )


def test_validate_columns_accepts_live_keys() -> None:
    fid = uuid.uuid4()
    mid = uuid.uuid4()
    # Should not raise.
    validate_columns(
        ["builtin:title", f"custom_field:{fid}", f"milestone:{mid}:date"],
        live_custom_field_ids={fid},
        live_milestone_def_ids={mid},
    )


def test_validate_columns_rejects_invalid_regex() -> None:
    with pytest.raises(ValidationError, match="invalid column key"):
        validate_columns(
            ["garbage"],
            live_custom_field_ids=set(),
            live_milestone_def_ids=set(),
        )


def test_validate_columns_rejects_too_many() -> None:
    with pytest.raises(ValidationError, match="too many"):
        validate_columns(
            [f"custom_field:{uuid.uuid4()}" for _ in range(61)],
            live_custom_field_ids=set(),
            live_milestone_def_ids=set(),
        )


def test_validate_sort_accepts_built_in() -> None:
    validate_sort("builtin:title", "asc")
    validate_sort("builtin:created_at", "desc")
    validate_sort(None, None)


def test_validate_sort_accepts_live_custom_field() -> None:
    # Phase 23.4: a custom-field sort key is valid when the field is live
    # in the template.
    fid = uuid.uuid4()
    validate_sort(
        f"custom_field:{fid}", "asc", live_custom_field_ids={fid}
    )


def test_validate_sort_rejects_unknown_custom_field() -> None:
    # Custom field not in the template's live set → rejected.
    with pytest.raises(ValidationError, match="not in this template"):
        validate_sort(
            f"custom_field:{uuid.uuid4()}", "asc", live_custom_field_ids=set()
        )


def test_validate_sort_rejects_non_sortable_key() -> None:
    # A milestone key is neither a built-in nor a custom_field → rejected.
    with pytest.raises(ValidationError, match="must be a built-in or custom_field"):
        validate_sort(f"milestone:{uuid.uuid4()}:date", "asc")


def test_validate_sort_rejects_unpaired() -> None:
    with pytest.raises(ValidationError, match="paired"):
        validate_sort("builtin:title", None)
    with pytest.raises(ValidationError, match="paired"):
        validate_sort(None, "asc")


def test_validate_sort_rejects_bad_direction() -> None:
    with pytest.raises(ValidationError, match="direction"):
        validate_sort("builtin:title", "sideways")


def test_strip_orphans_drops_dead_custom_field() -> None:
    live_fid = uuid.uuid4()
    dead_fid = uuid.uuid4()
    cleaned = strip_orphans(
        ["builtin:title", f"custom_field:{live_fid}", f"custom_field:{dead_fid}"],
        live_custom_field_ids={live_fid},
        live_milestone_def_ids=set(),
    )
    assert cleaned == ["builtin:title", f"custom_field:{live_fid}"]


def test_strip_orphans_drops_dead_milestone() -> None:
    live_mid = uuid.uuid4()
    dead_mid = uuid.uuid4()
    cleaned = strip_orphans(
        [f"milestone:{live_mid}:planned", f"milestone:{dead_mid}:actual"],
        live_custom_field_ids=set(),
        live_milestone_def_ids={live_mid},
    )
    assert cleaned == [f"milestone:{live_mid}:planned"]


def test_strip_orphans_keeps_invalid_regex_out() -> None:
    # An invalid-shape string also counts as orphan and is dropped.
    cleaned = strip_orphans(
        ["builtin:title", "garbage"],
        live_custom_field_ids=set(),
        live_milestone_def_ids=set(),
    )
    assert cleaned == ["builtin:title"]
