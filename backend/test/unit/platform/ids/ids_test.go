package ids_test

import (
	"testing"

	"github.com/nexus/fiscal-messaging/internal/platform/ids"
)

func TestNewAndParse(t *testing.T) {
	t.Parallel()

	id := ids.New()
	if id.Version() != 7 {
		t.Fatalf("expected UUIDv7, got version %d", id.Version())
	}
	parsed, err := ids.Parse(id.String())
	if err != nil || parsed != id {
		t.Fatalf("parse failed: %v", err)
	}
}
