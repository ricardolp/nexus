"""Pure rate-limit/backoff decisions for the SEFAZ NSU distribution query.

No I/O here on purpose — every rule is a plain function of
(outcome, current counters, now), so it can be unit-tested without a
database or a SEFAZ connection. See
docs/architecture/22_nfe_gateway_service.md#concorrência-e-rate-limit.

## The real SEFAZ limit (NT 2014.002 — confirmed 2026-08-16)

Not a rule we chose — this is what the SEFAZ distribution webservice itself
enforces, and getting it wrong means the CNPJ gets blocked, not just us:

- **20 consultas por hora** per CNPJ/certificate — a hard ceiling on this
  service's own webservice calls, catch-up bursts (cStat 138) included.
  Exceeding it returns cStat 656 ("consumo indevido — ultrapassou o limite
  de 20 consultas por hora") and blocks the CNPJ for the rest of that
  rolling hour, auto-unblocking after.
- After cStat 137 (no more documents right now), querying again **within
  the next hour** also triggers 656 — the "no more docs, come back later"
  signal has its own mandatory 1h floor, independent of the 20/h counter.
- Both are real floors, not suggestions: RATE_LIMIT_BASE/the no-content
  wait are clamped to never go below 1h even with jitter or a
  misconfigured POLL_INTERVAL — going below risks re-triggering 656 during
  what SEFAZ still considers the same violation window.

SAFE_CALLS_PER_WINDOW (18, not 20) leaves a two-call margin so clock drift
between us and SEFAZ, or a poll that straddles the window boundary, doesn't
tip us over the real ceiling.
"""

from __future__ import annotations

import random
from dataclasses import dataclass, replace
from datetime import datetime, timedelta
from enum import Enum


class PollOutcome(str, Enum):
    HAS_MORE = "has_more"      # cStat 138: ultNSU < maxNSU, more to fetch now
    NO_CONTENT = "no_content"  # cStat 137: caught up, must wait >= 1h
    RATE_LIMITED = "rate_limited"  # cStat 656: consumo indevido, circuit-break
    ERROR = "error"            # timeout/5xx/network/cert failure


RATE_WINDOW = timedelta(hours=1)
MAX_CALLS_PER_WINDOW = 20  # the real SEFAZ ceiling — do not raise this
SAFE_CALLS_PER_WINDOW = 18  # what we actually allow ourselves to use

RATE_LIMIT_BASE = RATE_WINDOW
RATE_LIMIT_CAP = timedelta(hours=6)
ERROR_BASE = timedelta(seconds=10)
ERROR_CAP = timedelta(minutes=30)


@dataclass(frozen=True)
class CallWindow:
    """Rolling 1h call budget for one company's distribution queries —
    persisted alongside the rest of the state row (window_started_at,
    calls_in_window columns) so it survives poller restarts."""

    started_at: datetime
    calls: int


def record_call(now: datetime, window: CallWindow) -> CallWindow:
    """Call once per actual SEFAZ request, right before deciding the next
    poll time — resets the window if it has rolled over, otherwise
    increments it."""
    if now - window.started_at >= RATE_WINDOW:
        return CallWindow(started_at=now, calls=1)
    return CallWindow(started_at=window.started_at, calls=window.calls + 1)


@dataclass(frozen=True)
class PollState:
    consecutive_empty_polls: int
    consecutive_errors: int


@dataclass(frozen=True)
class PollDecision:
    next_allowed_poll_at: datetime
    consecutive_empty_polls: int
    consecutive_errors: int
    status: str  # 'active' | 'error' — never 'paused' here, that's a manual action
    window: CallWindow


def _jittered_exponential(base: timedelta, cap: timedelta, attempt: int, *, floor: timedelta) -> timedelta:
    """attempt is 0-indexed (first backoff = base). jitter only ever adds
    time (1.0-1.15x), never subtracts — a real SEFAZ floor (like the 1h
    rate-limit window) must never be undercut by negative jitter."""
    raw = base.total_seconds() * (2**attempt)
    capped = min(raw, cap.total_seconds())
    jitter = random.uniform(1.0, 1.15)
    delay = timedelta(seconds=capped * jitter)
    return max(delay, floor)


def decide_next_poll(
    outcome: PollOutcome,
    now: datetime,
    state: PollState,
    poll_interval_seconds: int,
    window: CallWindow,
) -> PollDecision:
    """window must already reflect the call just made (see record_call) —
    callers call record_call() once per SEFAZ request, then this once per
    result, in that order."""
    if outcome is PollOutcome.HAS_MORE:
        # Still catching up on a backlog — SEFAZ itself says it's fine to
        # ask again immediately, but only within the 20/h budget: burning
        # through a large backlog in one burst is exactly the pattern that
        # trips 656 for other well-behaved callers, and it's rude to the
        # shared webservice regardless of whether it trips a rejection.
        if window.calls < SAFE_CALLS_PER_WINDOW:
            next_poll = now
        else:
            next_poll = window.started_at + RATE_WINDOW
        return PollDecision(
            next_allowed_poll_at=next_poll,
            consecutive_empty_polls=0,
            consecutive_errors=0,
            status="active",
            window=window,
        )

    if outcome is PollOutcome.NO_CONTENT:
        # >= 1h always, regardless of poll_interval_seconds — querying again
        # sooner than that after a 137 is itself a 656 trigger (see module
        # docstring), so the configured cadence can only ever lengthen this
        # wait, never shorten it below the real floor.
        interval = max(poll_interval_seconds, int(RATE_WINDOW.total_seconds()))
        return PollDecision(
            next_allowed_poll_at=now + timedelta(seconds=interval),
            consecutive_empty_polls=state.consecutive_empty_polls + 1,
            consecutive_errors=0,
            status="active",
            window=window,
        )

    if outcome is PollOutcome.RATE_LIMITED:
        delay = _jittered_exponential(
            RATE_LIMIT_BASE, RATE_LIMIT_CAP, state.consecutive_errors, floor=RATE_WINDOW
        )
        next_poll = now + delay
        # A 656 means SEFAZ considers the CNPJ blocked for this window
        # regardless of our own count — give ourselves a fresh budget
        # starting exactly when we're allowed back in, rather than
        # carrying over a count SEFAZ has already invalidated.
        reset_window = CallWindow(started_at=next_poll, calls=0)
        return PollDecision(
            next_allowed_poll_at=next_poll,
            consecutive_empty_polls=state.consecutive_empty_polls,
            consecutive_errors=state.consecutive_errors + 1,
            status="error",
            window=reset_window,
        )

    # ERROR — transient failure (timeout/5xx/cert), unrelated to SEFAZ's own
    # rate limit, so it gets its own much shorter backoff and doesn't touch
    # the call window.
    delay = _jittered_exponential(
        ERROR_BASE, ERROR_CAP, state.consecutive_errors, floor=timedelta(0)
    )
    return PollDecision(
        next_allowed_poll_at=now + delay,
        consecutive_empty_polls=state.consecutive_empty_polls,
        consecutive_errors=state.consecutive_errors + 1,
        status="error",
        window=replace(window),
    )
