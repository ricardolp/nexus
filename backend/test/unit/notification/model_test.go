package notification_test

import (
	"testing"

	"github.com/google/uuid"
	"github.com/nexus/fiscal-messaging/internal/notification"
	"github.com/nexus/fiscal-messaging/test/helpers"
)

func TestValidateCreateInput(t *testing.T) {
	t.Parallel()

	t.Run("ok", func(t *testing.T) {
		t.Parallel()
		typ, title, body, err := notification.ValidateCreateInput(notification.CreateInput{
			UserID: uuid.New(), Type: " fiscal.document.rejected ", Title: "  Documento rejeitado  ", Body: "  ver detalhes  ",
		})
		if err != nil {
			t.Fatal(err)
		}
		if typ != "fiscal.document.rejected" || title != "Documento rejeitado" || body != "ver detalhes" {
			t.Fatalf("typ=%q title=%q body=%q", typ, title, body)
		}
	})

	t.Run("missing_user_id", func(t *testing.T) {
		t.Parallel()
		_, _, _, err := notification.ValidateCreateInput(notification.CreateInput{
			Type: "type", Title: "title",
		})
		helpers.AssertDomainCode(t, err, "user_id_required")
	})

	t.Run("missing_type", func(t *testing.T) {
		t.Parallel()
		_, _, _, err := notification.ValidateCreateInput(notification.CreateInput{
			UserID: uuid.New(), Title: "title",
		})
		helpers.AssertDomainCode(t, err, "type_required")
	})

	t.Run("type_too_long", func(t *testing.T) {
		t.Parallel()
		_, _, _, err := notification.ValidateCreateInput(notification.CreateInput{
			UserID: uuid.New(), Type: string(make([]byte, notification.MaxTypeLength+1)), Title: "title",
		})
		helpers.AssertDomainCode(t, err, "invalid_type")
	})

	t.Run("missing_title", func(t *testing.T) {
		t.Parallel()
		_, _, _, err := notification.ValidateCreateInput(notification.CreateInput{
			UserID: uuid.New(), Type: "type",
		})
		helpers.AssertDomainCode(t, err, "title_required")
	})

	t.Run("title_too_long", func(t *testing.T) {
		t.Parallel()
		_, _, _, err := notification.ValidateCreateInput(notification.CreateInput{
			UserID: uuid.New(), Type: "type", Title: string(make([]byte, notification.MaxTitleLength+1)),
		})
		helpers.AssertDomainCode(t, err, "invalid_title")
	})

	t.Run("body_too_long", func(t *testing.T) {
		t.Parallel()
		_, _, _, err := notification.ValidateCreateInput(notification.CreateInput{
			UserID: uuid.New(), Type: "type", Title: "title", Body: string(make([]byte, notification.MaxBodyLength+1)),
		})
		helpers.AssertDomainCode(t, err, "invalid_body")
	})
}

func TestNormalizeListLimit(t *testing.T) {
	t.Parallel()

	cases := map[string]struct {
		in   int
		want int
	}{
		"zero_defaults":    {0, notification.DefaultListLimit},
		"negative_defaults": {-5, notification.DefaultListLimit},
		"within_bounds":    {10, 10},
		"clamped_to_max":   {notification.MaxListLimit + 50, notification.MaxListLimit},
	}
	for name, tc := range cases {
		tc := tc
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			if got := notification.NormalizeListLimit(tc.in); got != tc.want {
				t.Fatalf("got %d want %d", got, tc.want)
			}
		})
	}
}
