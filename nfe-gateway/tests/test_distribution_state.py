from datetime import datetime, timedelta, timezone

from nfe_gateway.distribution_state import (
    ERROR_CAP,
    MAX_CALLS_PER_WINDOW,
    RATE_LIMIT_CAP,
    RATE_WINDOW,
    SAFE_CALLS_PER_WINDOW,
    CallWindow,
    PollOutcome,
    PollState,
    decide_next_poll,
    record_call,
)

NOW = datetime(2026, 8, 16, 12, 0, 0, tzinfo=timezone.utc)
ZERO = PollState(consecutive_empty_polls=0, consecutive_errors=0)


def fresh_window(calls: int = 1) -> CallWindow:
    return CallWindow(started_at=NOW, calls=calls)


def test_has_more_polls_again_immediately_and_resets_counters():
    state = PollState(consecutive_empty_polls=3, consecutive_errors=2)
    decision = decide_next_poll(
        PollOutcome.HAS_MORE, NOW, state, poll_interval_seconds=1200, window=fresh_window(1)
    )

    assert decision.next_allowed_poll_at == NOW
    assert decision.consecutive_empty_polls == 0
    assert decision.consecutive_errors == 0
    assert decision.status == "active"


def test_has_more_throttles_once_the_safe_budget_is_used_up():
    window_start = NOW - timedelta(minutes=20)
    window = CallWindow(started_at=window_start, calls=SAFE_CALLS_PER_WINDOW)

    decision = decide_next_poll(
        PollOutcome.HAS_MORE, NOW, ZERO, poll_interval_seconds=1200, window=window
    )

    assert decision.next_allowed_poll_at == window_start + RATE_WINDOW
    assert decision.next_allowed_poll_at > NOW


def test_has_more_stays_below_the_real_sefaz_ceiling():
    # SAFE_CALLS_PER_WINDOW must leave real margin under the hard limit —
    # this is the whole point of not using MAX_CALLS_PER_WINDOW directly.
    assert SAFE_CALLS_PER_WINDOW < MAX_CALLS_PER_WINDOW


def test_no_content_waits_at_least_one_hour_regardless_of_configured_interval():
    decision = decide_next_poll(
        PollOutcome.NO_CONTENT, NOW, ZERO, poll_interval_seconds=1200, window=fresh_window()
    )

    # A 20-minute configured interval must NOT shorten the real 1h floor —
    # querying again before that risks 656 on top of the 137 that just came back.
    assert decision.next_allowed_poll_at == NOW + RATE_WINDOW
    assert decision.consecutive_empty_polls == 1
    assert decision.status == "active"


def test_no_content_respects_a_longer_configured_interval():
    decision = decide_next_poll(
        PollOutcome.NO_CONTENT, NOW, ZERO, poll_interval_seconds=7200, window=fresh_window()
    )

    assert decision.next_allowed_poll_at == NOW + timedelta(seconds=7200)


def test_rate_limited_backs_off_at_least_exactly_one_hour():
    decision = decide_next_poll(
        PollOutcome.RATE_LIMITED, NOW, ZERO, poll_interval_seconds=1200, window=fresh_window()
    )

    delay = decision.next_allowed_poll_at - NOW
    # Jitter only ever adds time now — must never resolve under the real
    # SEFAZ floor, unlike the old (0.85, 1.15) range which could.
    assert delay >= RATE_WINDOW
    assert decision.status == "error"
    assert decision.consecutive_errors == 1


def test_rate_limited_backoff_grows_but_stays_capped():
    hammered = PollState(consecutive_empty_polls=0, consecutive_errors=10)
    decision = decide_next_poll(
        PollOutcome.RATE_LIMITED, NOW, hammered, poll_interval_seconds=1200, window=fresh_window()
    )

    delay = decision.next_allowed_poll_at - NOW
    assert delay <= RATE_LIMIT_CAP * 1.16  # cap plus jitter ceiling


def test_rate_limited_resets_the_call_window_at_the_retry_time():
    decision = decide_next_poll(
        PollOutcome.RATE_LIMITED, NOW, ZERO, poll_interval_seconds=1200, window=fresh_window(19)
    )

    assert decision.window.calls == 0
    assert decision.window.started_at == decision.next_allowed_poll_at


def test_transient_error_backs_off_much_faster_than_rate_limit():
    decision = decide_next_poll(
        PollOutcome.ERROR, NOW, ZERO, poll_interval_seconds=1200, window=fresh_window()
    )

    delay = decision.next_allowed_poll_at - NOW
    assert delay < timedelta(minutes=1)


def test_transient_error_backoff_is_capped():
    hammered = PollState(consecutive_empty_polls=0, consecutive_errors=20)
    decision = decide_next_poll(
        PollOutcome.ERROR, NOW, hammered, poll_interval_seconds=1200, window=fresh_window()
    )

    delay = decision.next_allowed_poll_at - NOW
    assert delay <= ERROR_CAP * 1.16


def test_transient_error_does_not_touch_the_call_window():
    window = fresh_window(7)
    decision = decide_next_poll(
        PollOutcome.ERROR, NOW, ZERO, poll_interval_seconds=1200, window=window
    )

    assert decision.window == window


def test_record_call_increments_within_the_same_window():
    window = CallWindow(started_at=NOW, calls=3)
    updated = record_call(NOW + timedelta(minutes=10), window)

    assert updated.started_at == NOW
    assert updated.calls == 4


def test_record_call_resets_after_the_window_rolls_over():
    window = CallWindow(started_at=NOW, calls=19)
    later = NOW + RATE_WINDOW + timedelta(seconds=1)

    updated = record_call(later, window)

    assert updated.started_at == later
    assert updated.calls == 1


def test_record_call_resets_exactly_at_the_window_boundary():
    window = CallWindow(started_at=NOW, calls=19)
    updated = record_call(NOW + RATE_WINDOW, window)

    assert updated.calls == 1
