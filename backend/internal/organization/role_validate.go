package organization

import (
	"regexp"
	"sort"
	"strings"

	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
)

var roleSlugPattern = regexp.MustCompile(`^[a-z0-9]+(?:_[a-z0-9]+)*$`)

const (
	maxRoleNameLength        = 100
	maxRoleSlugLength        = 60
	maxRoleDescriptionLength = 500
	maxPermissionsPerRole    = 100
)

// PermissionCatalog is the fixed set of resource:action permissions a
// tenant role may grant. Mirrors docs/architecture/03_identity_and_access.md
// — extend both together when a new permission is introduced.
var PermissionCatalog = []string{
	"organization:read", "organization:update",
	"member:invite", "member:suspend",
	"role:manage",
	"company:manage",
	"nfe:read", "nfe:create", "nfe:cancel",
	"nfse:read", "nfse:create",
	"nfe_inbound:read", "nfe_inbound:manage",
	"integration:manage", "webhook:manage",
	"audit:read",
	"document_payload:read_sensitive",
}

var allowedPermissions = buildPermissionSet(PermissionCatalog)

func buildPermissionSet(permissions []string) map[string]struct{} {
	m := make(map[string]struct{}, len(permissions))
	for _, p := range permissions {
		m[p] = struct{}{}
	}
	return m
}

// SplitPermission parses a "resource:action" permission into its parts.
func SplitPermission(permission string) (resource, action string, ok bool) {
	resource, action, found := strings.Cut(permission, ":")
	if !found || resource == "" || action == "" {
		return "", "", false
	}
	return resource, action, true
}

// ValidatePermissions normalizes a role's requested permission set against
// PermissionCatalog: trims, deduplicates and sorts (for stable storage and
// comparison), rejecting anything outside the catalog.
func ValidatePermissions(permissions []string) ([]string, error) {
	if len(permissions) == 0 {
		return nil, domainerr.Validation("permissions_required", "at least one permission is required")
	}
	if len(permissions) > maxPermissionsPerRole {
		return nil, domainerr.Validation("invalid_permissions", "at most 100 permissions are allowed")
	}
	seen := make(map[string]struct{}, len(permissions))
	out := make([]string, 0, len(permissions))
	for _, raw := range permissions {
		p := strings.TrimSpace(raw)
		if _, ok := allowedPermissions[p]; !ok {
			return nil, domainerr.Validation("invalid_permission", "unsupported permission: "+p)
		}
		if _, dup := seen[p]; dup {
			continue
		}
		seen[p] = struct{}{}
		out = append(out, p)
	}
	sort.Strings(out)
	return out, nil
}

// normalizeRoleSlug defaults the slug from the role name (space-separated
// words joined by underscores) when the caller does not supply one.
func normalizeRoleSlug(name, slug string) string {
	s := strings.ToLower(strings.TrimSpace(slug))
	if s != "" {
		return s
	}
	return strings.Join(strings.Fields(strings.ToLower(strings.TrimSpace(name))), "_")
}

// ValidateRoleInput validates role creation: name, slug (defaulted from name
// when omitted) and the permission set.
func ValidateRoleInput(in CreateRoleInput) (name, slug string, description *string, permissions []string, err error) {
	name = strings.TrimSpace(in.Name)
	if name == "" {
		return "", "", nil, nil, domainerr.Validation("invalid_role", "name is required")
	}
	if len(name) > maxRoleNameLength {
		return "", "", nil, nil, domainerr.Validation("invalid_role", "name must contain at most 100 characters")
	}
	slug = normalizeRoleSlug(in.Name, in.Slug)
	if slug == "" || len(slug) > maxRoleSlugLength || !roleSlugPattern.MatchString(slug) {
		return "", "", nil, nil, domainerr.Validation("invalid_slug", "slug must contain only lowercase letters, numbers and single underscores")
	}
	desc := strings.TrimSpace(in.Description)
	if len(desc) > maxRoleDescriptionLength {
		return "", "", nil, nil, domainerr.Validation("invalid_role", "description must contain at most 500 characters")
	}
	if desc != "" {
		description = &desc
	}
	permissions, err = ValidatePermissions(in.Permissions)
	if err != nil {
		return "", "", nil, nil, err
	}
	return name, slug, description, permissions, nil
}

// ValidateUpdateRoleInput validates a role edit — unlike creation, slug is
// immutable and not part of this input.
func ValidateUpdateRoleInput(in UpdateRoleInput) (name string, description *string, permissions []string, err error) {
	name = strings.TrimSpace(in.Name)
	if name == "" {
		return "", nil, nil, domainerr.Validation("invalid_role", "name is required")
	}
	if len(name) > maxRoleNameLength {
		return "", nil, nil, domainerr.Validation("invalid_role", "name must contain at most 100 characters")
	}
	desc := strings.TrimSpace(in.Description)
	if len(desc) > maxRoleDescriptionLength {
		return "", nil, nil, domainerr.Validation("invalid_role", "description must contain at most 500 characters")
	}
	if desc != "" {
		description = &desc
	}
	permissions, err = ValidatePermissions(in.Permissions)
	if err != nil {
		return "", nil, nil, err
	}
	return name, description, permissions, nil
}
