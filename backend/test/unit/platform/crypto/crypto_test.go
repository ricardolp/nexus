package crypto_test

import (
	"errors"
	"testing"

	"github.com/nexus/fiscal-messaging/internal/platform/crypto"
)

func TestPasswordHashAndVerify(t *testing.T) {
	t.Parallel()

	hash, err := crypto.HashPassword("senha-super-segura")
	if err != nil {
		t.Fatal(err)
	}
	if !crypto.VerifyPassword(hash, "senha-super-segura") {
		t.Fatal("expected password to verify")
	}
	if crypto.VerifyPassword(hash, "outra-senha") {
		t.Fatal("expected password mismatch")
	}
}

func TestSHA256AndToken(t *testing.T) {
	t.Parallel()

	if crypto.SHA256Hex([]byte("abc")) == "" {
		t.Fatal("empty hash")
	}
	token, err := crypto.RandomToken(16)
	if err != nil || token == "" {
		t.Fatalf("token=%q err=%v", token, err)
	}
	if crypto.HashToken(token) == token {
		t.Fatal("hash should differ from raw token")
	}
}

func TestEncryptDecrypt(t *testing.T) {
	t.Parallel()

	key := make([]byte, 32)
	for i := range key {
		key[i] = byte(i)
	}

	ciphertext, err := crypto.Encrypt(key, []byte("client-secret-value"))
	if err != nil {
		t.Fatal(err)
	}
	if ciphertext == "" {
		t.Fatal("expected non-empty ciphertext")
	}

	plaintext, err := crypto.Decrypt(key, ciphertext)
	if err != nil {
		t.Fatal(err)
	}
	if string(plaintext) != "client-secret-value" {
		t.Fatalf("got %q", plaintext)
	}

	otherKey := make([]byte, 32)
	for i := range otherKey {
		otherKey[i] = byte(255 - i)
	}
	if _, err := crypto.Decrypt(otherKey, ciphertext); err == nil {
		t.Fatal("expected decrypt with wrong key to fail")
	}

	if _, err := crypto.Encrypt([]byte("short"), []byte("x")); !errors.Is(err, crypto.ErrInvalidEncryptionKey) {
		t.Fatalf("expected ErrInvalidEncryptionKey, got %v", err)
	}
}
