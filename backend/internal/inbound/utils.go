package inbound

import "strconv"

func formatFloat(v float64) string {
	return strconv.FormatFloat(v, 'f', 4, 64)
}
