package domainerr_test

import (
	"errors"
	"testing"

	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
)

func TestErrorHelpers(t *testing.T) {
	t.Parallel()

	err := domainerr.Validation("invalid_cnpj", "bad cnpj")
	if err.Status != 422 || err.Code != "invalid_cnpj" {
		t.Fatalf("%#v", err)
	}
	if !errors.As(err, new(*domainerr.Error)) {
		t.Fatal("errors.As failed")
	}

	if domainerr.Conflict("x", "y").Status != 409 {
		t.Fatal("conflict")
	}
	if domainerr.NotFound("x", "y").Status != 404 {
		t.Fatal("not found")
	}
	if domainerr.Unauthorized("nope").Status != 401 {
		t.Fatal("unauthorized")
	}
	if domainerr.Forbidden("nope").Status != 403 {
		t.Fatal("forbidden")
	}
}
