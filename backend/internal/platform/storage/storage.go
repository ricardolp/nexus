package storage

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/aws/aws-sdk-go-v2/service/s3/types"
	"github.com/nexus/fiscal-messaging/internal/platform/crypto"
)

type ObjectStore interface {
	Put(ctx context.Context, key string, contentType string, data []byte) error
	Get(ctx context.Context, key string) ([]byte, error)
	Delete(ctx context.Context, key string) error
}

// IsNotFound reports a missing blob. Local files surface os.ErrNotExist
// (on Windows, a missing parent directory is path-not-found, not ErrNotExist).
// S3-compatible stores surface NoSuchKey.
func IsNotFound(err error) bool {
	if err == nil {
		return false
	}
	if os.IsNotExist(err) || isWindowsPathMissing(err) {
		return true
	}
	var missing *types.NoSuchKey
	if errors.As(err, &missing) {
		return true
	}
	return strings.Contains(err.Error(), "NoSuchKey")
}

func isWindowsPathMissing(err error) bool {
	var pe *os.PathError
	if !errors.As(err, &pe) || pe.Err == nil {
		return false
	}
	msg := strings.ToLower(pe.Err.Error())
	return strings.Contains(msg, "cannot find the file") || strings.Contains(msg, "cannot find the path")
}

// LocalStore is the dev/on-prem object store — payloads are fiscal document
// XML/JSON (CNPJs, values, items), so they're encrypted at rest with the
// same AES-256-GCM helper used everywhere else in the app for
// encryption-at-rest (integration client_secret, the local certificate
// store), keyed by SECRETS_ENCRYPTION_KEY. This makes the "payload bruto
// armazenado em object storage criptografado" principle
// (01_system_architecture.md) actually true for local storage too, not
// just for a production cloud backend that happens to encrypt at rest on
// its own. NewLocalStore fails closed without a valid key — every process
// that persists fiscal documents needs this, so a missing key should stop
// the process at boot, not silently write cleartext.
type LocalStore struct {
	root string
	key  []byte
}

func NewLocalStore(root string, encryptionKey []byte) (*LocalStore, error) {
	if len(encryptionKey) != 32 {
		return nil, fmt.Errorf("storage: SECRETS_ENCRYPTION_KEY (32 bytes) is required for the local object store")
	}
	if err := os.MkdirAll(root, 0o755); err != nil {
		return nil, err
	}
	return &LocalStore{root: root, key: encryptionKey}, nil
}

func (s *LocalStore) Put(_ context.Context, key string, _ string, data []byte) error {
	full := filepath.Join(s.root, filepath.FromSlash(key))
	if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
		return err
	}
	encoded, err := crypto.Encrypt(s.key, data)
	if err != nil {
		return fmt.Errorf("encrypt object %s: %w", key, err)
	}
	return os.WriteFile(full, []byte(encoded), 0o600)
}

func (s *LocalStore) Get(_ context.Context, key string) ([]byte, error) {
	full := filepath.Join(s.root, filepath.FromSlash(key))
	raw, err := os.ReadFile(full)
	if err != nil {
		return nil, fmt.Errorf("read object %s: %w", key, err)
	}
	data, err := crypto.Decrypt(s.key, string(raw))
	if err != nil {
		return nil, fmt.Errorf("decrypt object %s: %w", key, err)
	}
	return data, nil
}

// Delete removes an object. Missing files are not an error — callers use
// this for best-effort cleanup after the owning DB rows are already gone.
func (s *LocalStore) Delete(_ context.Context, key string) error {
	full := filepath.Join(s.root, filepath.FromSlash(key))
	if err := os.Remove(full); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("delete object %s: %w", key, err)
	}
	return nil
}

func ObjectKey(prefix, organizationID, documentID, payloadType, filename string) string {
	return fmt.Sprintf("%s/%s/%s/%s/%s", prefix, organizationID, documentID, payloadType, filename)
}
