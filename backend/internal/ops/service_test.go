package ops

import "testing"

func TestClampLimit(t *testing.T) {
	t.Parallel()

	cases := []struct {
		in   int
		want int
	}{
		{0, 50},
		{-1, 50},
		{10, 10},
		{50, 50},
		{200, 200},
		{201, 200},
		{1000, 200},
	}
	for _, tc := range cases {
		if got := clampLimit(tc.in); got != tc.want {
			t.Fatalf("clampLimit(%d)=%d, want %d", tc.in, got, tc.want)
		}
	}
}
