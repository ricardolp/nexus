package certificate_test

import (
	"errors"
	"fmt"
	"testing"

	"github.com/nexus/fiscal-messaging/internal/certificate"
	"github.com/nexus/fiscal-messaging/internal/platform/keyvault"
	"github.com/nexus/fiscal-messaging/test/helpers"
)

func TestWrapStoreErrorNotConfiguredIs503(t *testing.T) {
	t.Parallel()
	err := certificate.WrapStoreError(keyvault.ErrNotConfigured)
	helpers.AssertDomainCode(t, err, "certificate_storage_unavailable")
	helpers.AssertDomainStatus(t, err, 503)
}

func TestWrapStoreErrorExpiredClientSecretIs503(t *testing.T) {
	t.Parallel()
	err := certificate.WrapStoreError(fmt.Errorf("import certificate into key vault: AADSTS7000222: The provided client secret keys for app 'x' are expired"))
	helpers.AssertDomainCode(t, err, "certificate_storage_unavailable")
	helpers.AssertDomainStatus(t, err, 503)
}

func TestWrapStoreErrorUnknownIsUnchanged(t *testing.T) {
	t.Parallel()
	in := errors.New("key vault did not return a certificate identifier")
	if got := certificate.WrapStoreError(in); !errors.Is(got, in) {
		t.Fatalf("got %#v, want original error", got)
	}
}
