package storage_test

import (
	"bytes"
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/nexus/fiscal-messaging/internal/platform/storage"
)

func testKey() []byte {
	return bytes.Repeat([]byte{0x24}, 32)
}

func TestNewLocalStoreRequiresA32ByteKey(t *testing.T) {
	t.Parallel()

	if _, err := storage.NewLocalStore(t.TempDir(), nil); err == nil {
		t.Fatal("expected an error with no encryption key")
	}
	if _, err := storage.NewLocalStore(t.TempDir(), []byte("too-short")); err == nil {
		t.Fatal("expected an error with a short encryption key")
	}
}

func TestLocalStorePutGet(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	store, err := storage.NewLocalStore(root, testKey())
	if err != nil {
		t.Fatal(err)
	}

	key := storage.ObjectKey("fiscal", "org", "doc", "original_request", "payload.bin")
	if err := store.Put(context.Background(), key, "application/json", []byte(`{"a":1}`)); err != nil {
		t.Fatal(err)
	}
	got, err := store.Get(context.Background(), key)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != `{"a":1}` {
		t.Fatalf("got %s", got)
	}
	if filepath.ToSlash(key) != "fiscal/org/doc/original_request/payload.bin" {
		t.Fatalf("key=%s", key)
	}
}

func TestLocalStoreEncryptedAtRest(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	store, err := storage.NewLocalStore(root, testKey())
	if err != nil {
		t.Fatal(err)
	}

	key := storage.ObjectKey("fiscal", "org", "doc", "original_request", "payload.bin")
	plaintext := []byte(`{"cnpj_emitente":"12345678000199","valor_total":"999999.99"}`)
	if err := store.Put(context.Background(), key, "application/json", plaintext); err != nil {
		t.Fatal(err)
	}

	raw, err := os.ReadFile(filepath.Join(root, filepath.FromSlash(key)))
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(raw, plaintext) {
		t.Fatal("stored file contains the plaintext payload — not encrypted at rest")
	}

	// A store opened with a different key must not be able to read data
	// written under the first key, even pointed at the same directory.
	wrongKeyStore, err := storage.NewLocalStore(root, bytes.Repeat([]byte{0x99}, 32))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := wrongKeyStore.Get(context.Background(), key); err == nil {
		t.Fatal("expected decryption to fail with the wrong key")
	}
}
