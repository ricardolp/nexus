from datetime import datetime, timedelta, timezone

from nfe_gateway.oauth import REFRESH_MARGIN, CachedToken, needs_refresh

NOW = datetime(2026, 8, 16, 12, 0, 0, tzinfo=timezone.utc)


def test_needs_refresh_when_nothing_cached():
    assert needs_refresh(None, NOW) is True


def test_does_not_need_refresh_well_before_expiry():
    cached = CachedToken(access_token="t", expires_at=NOW + timedelta(minutes=30))
    assert needs_refresh(cached, NOW) is False


def test_needs_refresh_inside_the_safety_margin():
    cached = CachedToken(access_token="t", expires_at=NOW + REFRESH_MARGIN - timedelta(seconds=1))
    assert needs_refresh(cached, NOW) is True


def test_needs_refresh_exactly_at_the_margin_boundary():
    cached = CachedToken(access_token="t", expires_at=NOW + REFRESH_MARGIN)
    assert needs_refresh(cached, NOW) is True


def test_needs_refresh_after_actual_expiry():
    cached = CachedToken(access_token="t", expires_at=NOW - timedelta(minutes=1))
    assert needs_refresh(cached, NOW) is True
