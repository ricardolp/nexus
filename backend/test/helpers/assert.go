package helpers

import (
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"testing"

	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
)

// AssertDomainCode checks that err is a domainerr.Error with the expected code.
func AssertDomainCode(t *testing.T, err error, code string) {
	t.Helper()
	var de *domainerr.Error
	if !errors.As(err, &de) {
		t.Fatalf("expected domainerr.Error, got %T (%v)", err, err)
	}
	if de.Code != code {
		t.Fatalf("code=%q want %q (detail=%q)", de.Code, code, de.Detail)
	}
}

// AssertDomainStatus checks HTTP status on a domain error.
func AssertDomainStatus(t *testing.T, err error, status int) {
	t.Helper()
	var de *domainerr.Error
	if !errors.As(err, &de) {
		t.Fatalf("expected domainerr.Error, got %T (%v)", err, err)
	}
	if de.Status != status {
		t.Fatalf("status=%d want %d", de.Status, status)
	}
}

// TestdataPath returns an absolute path under test/testdata.
func TestdataPath(parts ...string) string {
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		panic("runtime.Caller failed")
	}
	root := filepath.Join(filepath.Dir(file), "..", "testdata")
	return filepath.Join(append([]string{root}, parts...)...)
}

// ReadTestdata reads a fixture file from test/testdata.
func ReadTestdata(t *testing.T, parts ...string) []byte {
	t.Helper()
	path := TestdataPath(parts...)
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read testdata %s: %v", path, err)
	}
	return data
}
