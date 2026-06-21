from backend.app.services.form_targets import (
    target_descriptor, bindable_targets, is_compatible, target_field,
)


def test_cor_targets():
    d = target_descriptor("cor")
    assert d["requires_project"] is True
    keys = {f["key"] for f in bindable_targets("cor")}
    assert keys == {"description", "amount"}
    assert target_field("cor", "amount")["type"] == "currency"
    assert target_descriptor(None) is None
    assert bindable_targets(None) == []


def test_compatibility_matrix():
    assert is_compatible("long_text", "text")
    assert is_compatible("short_text", "text")
    assert is_compatible("currency", "currency")
    assert is_compatible("integer", "number")
    assert is_compatible("decimal", "number")
    assert is_compatible("date", "date")
    assert is_compatible("single_select", "select")
    assert is_compatible("boolean", "toggle")
    assert not is_compatible("currency", "text")
    assert not is_compatible("short_text", "currency")
