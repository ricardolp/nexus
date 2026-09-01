package organization_test

import (
	"testing"

	"github.com/nexus/fiscal-messaging/internal/organization"
	"github.com/nexus/fiscal-messaging/test/helpers"
)

func TestValidatePermissions(t *testing.T) {
	t.Parallel()

	t.Run("ok_dedup_and_sorted", func(t *testing.T) {
		t.Parallel()
		got, err := organization.ValidatePermissions([]string{"nfe:create", "nfe:read", "nfe:create"})
		if err != nil {
			t.Fatal(err)
		}
		want := []string{"nfe:create", "nfe:read"}
		if len(got) != len(want) || got[0] != want[0] || got[1] != want[1] {
			t.Fatalf("got %#v want %#v", got, want)
		}
	})

	t.Run("empty", func(t *testing.T) {
		t.Parallel()
		_, err := organization.ValidatePermissions(nil)
		helpers.AssertDomainCode(t, err, "permissions_required")
	})

	t.Run("unknown_permission", func(t *testing.T) {
		t.Parallel()
		_, err := organization.ValidatePermissions([]string{"nfe:launch_rocket"})
		helpers.AssertDomainCode(t, err, "invalid_permission")
	})
}

func TestSplitPermission(t *testing.T) {
	t.Parallel()

	resource, action, ok := organization.SplitPermission("nfe:create")
	if !ok || resource != "nfe" || action != "create" {
		t.Fatalf("got resource=%q action=%q ok=%v", resource, action, ok)
	}

	if _, _, ok := organization.SplitPermission("invalid"); ok {
		t.Fatal("expected ok=false for permission without a colon")
	}
}

func TestValidateRoleInput(t *testing.T) {
	t.Parallel()

	t.Run("ok_slug_defaults_from_name", func(t *testing.T) {
		t.Parallel()
		name, slug, description, permissions, err := organization.ValidateRoleInput(organization.CreateRoleInput{
			Name:        " Analista Fiscal ",
			Permissions: []string{"nfe:read", "nfe:create"},
		})
		if err != nil {
			t.Fatal(err)
		}
		if name != "Analista Fiscal" {
			t.Fatalf("name=%q", name)
		}
		if slug != "analista_fiscal" {
			t.Fatalf("slug=%q", slug)
		}
		if description != nil {
			t.Fatalf("description=%v want nil", description)
		}
		if len(permissions) != 2 {
			t.Fatalf("permissions=%#v", permissions)
		}
	})

	t.Run("explicit_slug", func(t *testing.T) {
		t.Parallel()
		_, slug, _, _, err := organization.ValidateRoleInput(organization.CreateRoleInput{
			Name: "Analista Fiscal", Slug: "custom_slug", Permissions: []string{"nfe:read"},
		})
		if err != nil {
			t.Fatal(err)
		}
		if slug != "custom_slug" {
			t.Fatalf("slug=%q", slug)
		}
	})

	t.Run("missing_name", func(t *testing.T) {
		t.Parallel()
		_, _, _, _, err := organization.ValidateRoleInput(organization.CreateRoleInput{
			Permissions: []string{"nfe:read"},
		})
		helpers.AssertDomainCode(t, err, "invalid_role")
	})

	t.Run("invalid_permissions_propagate", func(t *testing.T) {
		t.Parallel()
		_, _, _, _, err := organization.ValidateRoleInput(organization.CreateRoleInput{
			Name: "Analista Fiscal", Permissions: []string{"unknown:scope"},
		})
		helpers.AssertDomainCode(t, err, "invalid_permission")
	})
}

func TestValidateUpdateRoleInput(t *testing.T) {
	t.Parallel()

	name, description, permissions, err := organization.ValidateUpdateRoleInput(organization.UpdateRoleInput{
		Name: "Analista Fiscal Sr", Description: "Acesso de leitura e emissão", Permissions: []string{"nfe:read"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if name != "Analista Fiscal Sr" || description == nil || *description != "Acesso de leitura e emissão" {
		t.Fatalf("name=%q description=%v", name, description)
	}
	if len(permissions) != 1 || permissions[0] != "nfe:read" {
		t.Fatalf("permissions=%#v", permissions)
	}

	_, _, _, err = organization.ValidateUpdateRoleInput(organization.UpdateRoleInput{
		Name: "", Permissions: []string{"nfe:read"},
	})
	helpers.AssertDomainCode(t, err, "invalid_role")
}
