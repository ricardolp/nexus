package billing

import (
	"strings"
	"time"
	_ "time/tzdata"

	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
)

const billingLocationName = "America/Sao_Paulo"

func billingLocation() *time.Location {
	loc, err := time.LoadLocation(billingLocationName)
	if err != nil {
		return time.FixedZone("BRT", -3*60*60)
	}
	return loc
}

// ParsePeriod interprets from/to as inclusive calendar dates in
// America/Sao_Paulo and returns a half-open UTC interval [start, end).
// Empty values default to the current month. The range cannot exceed 366 days.
func ParsePeriod(fromDate, toDate string, now time.Time) (from, toExclusive time.Time, err error) {
	loc := billingLocation()
	now = now.In(loc)

	fromRaw := strings.TrimSpace(fromDate)
	toRaw := strings.TrimSpace(toDate)

	if fromRaw == "" && toRaw == "" {
		from = time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, loc)
		toExclusive = from.AddDate(0, 1, 0)
		return from.UTC(), toExclusive.UTC(), nil
	}
	if fromRaw == "" || toRaw == "" {
		return time.Time{}, time.Time{}, domainerr.Validation("invalid_period", "from and to must be provided together as YYYY-MM-DD")
	}

	fromDay, err := time.ParseInLocation("2006-01-02", fromRaw, loc)
	if err != nil {
		return time.Time{}, time.Time{}, domainerr.Validation("invalid_from", "from must be YYYY-MM-DD")
	}
	toDay, err := time.ParseInLocation("2006-01-02", toRaw, loc)
	if err != nil {
		return time.Time{}, time.Time{}, domainerr.Validation("invalid_to", "to must be YYYY-MM-DD")
	}
	if toDay.Before(fromDay) {
		return time.Time{}, time.Time{}, domainerr.Validation("invalid_period", "to must be on or after from")
	}
	toExclusive = toDay.AddDate(0, 0, 1)
	if toExclusive.Sub(fromDay) > 366*24*time.Hour {
		return time.Time{}, time.Time{}, domainerr.Validation("period_too_long", "period must not exceed 366 days")
	}
	return fromDay.UTC(), toExclusive.UTC(), nil
}

func FormatDateBR(t time.Time) string {
	return t.In(billingLocation()).Format("02.01.2006")
}

func FormatPeriodBR(fromUTC, toInclusiveUTC time.Time) string {
	return FormatDateBR(fromUTC) + " – " + FormatDateBR(toInclusiveUTC)
}

func PeriodEndInclusive(toExclusiveUTC time.Time) time.Time {
	return toExclusiveUTC.In(billingLocation()).Add(-time.Second)
}
