package identity_test

import (
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/nexus/fiscal-messaging/internal/identity"
	"github.com/nexus/fiscal-messaging/internal/messaging"
)

func TestInviteAcceptURL(t *testing.T) {
	t.Parallel()
	got := identity.InviteAcceptURL("https://app.example.com/", "abc+def")
	if got != "https://app.example.com/invite?token=abc%2Bdef" {
		t.Fatalf("got %q", got)
	}
}

func TestParseInviteEventAndBuildMessage(t *testing.T) {
	t.Parallel()

	eventID := uuid.New()
	orgID := uuid.New()
	userID := uuid.New()
	expires := time.Date(2026, 8, 25, 15, 0, 0, 0, time.UTC)
	_, payload, err := messaging.NewCloudEvent(
		eventID, orgID, userID,
		"fiscal_saas/identity",
		messaging.EventUserInvited,
		"users",
		map[string]any{
			"email":         "Pessoa <script>@empresa.com",
			"token":         "tok/en",
			"expires_at":    expires,
			"platform_role": "member",
		},
	)
	if err != nil {
		t.Fatal(err)
	}

	in, err := identity.ParseInviteEvent(payload)
	if err != nil {
		t.Fatal(err)
	}
	if in.Email != "Pessoa <script>@empresa.com" || in.Token != "tok/en" {
		t.Fatalf("%#v", in)
	}

	msg, err := identity.BuildInviteMessage("Nexus <noreply@nexus.app>", "https://frontend.example.com", in)
	if err != nil {
		t.Fatal(err)
	}
	if msg.Subject != "Você foi convidado para o Nexus" {
		t.Fatalf("subject=%q", msg.Subject)
	}
	if len(msg.To) != 1 || msg.To[0] != in.Email {
		t.Fatalf("to=%v", msg.To)
	}
	raw := string(msg.Bytes())
	if !strings.Contains(msg.HTMLBody, "Pessoa &lt;script&gt;@empresa.com") {
		t.Fatalf("email was not escaped: %s", msg.HTMLBody)
	}
	if !strings.Contains(raw, "/invite?token=tok%2Fen") {
		t.Fatalf("missing encoded accept url: %s", raw)
	}
	for _, color := range []string{"#5c71ff", "#f062c8", "#ae6adf", "#05030a"} {
		if !strings.Contains(msg.HTMLBody, color) {
			t.Fatalf("missing brand color %s", color)
		}
	}
}

func TestBuildInviteMessageStaffCopy(t *testing.T) {
	t.Parallel()
	msg, err := identity.BuildInviteMessage("Nexus <noreply@nexus.app>", "https://frontend.example.com", identity.InviteMailInput{
		Email:        "ti@empresa.com",
		Token:        "abc",
		PlatformRole: identity.PlatformRoleSupport,
	})
	if err != nil {
		t.Fatal(err)
	}
	if msg.Subject != "Você foi convidado para a equipe Nexus" {
		t.Fatalf("subject=%q", msg.Subject)
	}
	if !strings.Contains(msg.HTMLBody, "equipe da plataforma") {
		t.Fatalf("missing staff copy: %s", msg.HTMLBody)
	}
}

func TestParseInviteEventMissingToken(t *testing.T) {
	t.Parallel()
	payload, _ := json.Marshal(map[string]any{
		"specversion": "1.0",
		"data":        map[string]any{"email": "a@b.com"},
	})
	if _, err := identity.ParseInviteEvent(payload); err == nil {
		t.Fatal("expected error")
	}
}
