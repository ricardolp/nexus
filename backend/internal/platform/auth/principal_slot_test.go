package auth

import (
	"context"
	"testing"

	"github.com/google/uuid"
)

func TestPrincipalSlotSeesInnerPrincipal(t *testing.T) {
	ctx, resolved := WithPrincipalSlot(context.Background())
	if _, ok := resolved(); ok {
		t.Fatal("slot must be empty before auth runs")
	}

	orgID := uuid.New()
	_ = WithPrincipal(ctx, &Principal{OrganizationID: orgID})

	p, ok := resolved()
	if !ok || p.OrganizationID != orgID {
		t.Fatalf("resolved=%v ok=%v, want org %s", p, ok, orgID)
	}
}
