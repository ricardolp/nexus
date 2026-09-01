package inbound_test

import (
	"fmt"
	"slices"
	"testing"

	"github.com/nexus/fiscal-messaging/internal/inbound"
)

func TestNormalizeResponsibleEmails(t *testing.T) {
	t.Parallel()

	t.Run("empty", func(t *testing.T) {
		got, err := inbound.NormalizeResponsibleEmails(nil)
		if err != nil {
			t.Fatal(err)
		}
		if len(got) != 0 {
			t.Fatalf("expected empty slice, got %#v", got)
		}
	})

	t.Run("trims lowercases and dedupes", func(t *testing.T) {
		got, err := inbound.NormalizeResponsibleEmails([]string{
			"  Ana@Empresa.com  ",
			"ana@empresa.com",
			"compras@empresa.com",
			"",
		})
		if err != nil {
			t.Fatal(err)
		}
		want := []string{"ana@empresa.com", "compras@empresa.com"}
		if !slices.Equal(got, want) {
			t.Fatalf("got %#v want %#v", got, want)
		}
	})

	t.Run("rejects invalid", func(t *testing.T) {
		_, err := inbound.NormalizeResponsibleEmails([]string{"not-an-email"})
		if err == nil {
			t.Fatal("expected validation error")
		}
	})

	t.Run("rejects more than 20", func(t *testing.T) {
		emails := make([]string, 21)
		for i := range emails {
			emails[i] = fmt.Sprintf("user%d@empresa.com", i)
		}
		_, err := inbound.NormalizeResponsibleEmails(emails)
		if err == nil {
			t.Fatal("expected validation error")
		}
	})
}
