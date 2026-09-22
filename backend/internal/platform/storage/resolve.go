package storage

import (
	"fmt"
	"strings"
)

// Resolve picks the ObjectStore from STORAGE_BACKEND ("local" default, or "s3").
func Resolve(backend, localPath string, encryptionKey []byte) (ObjectStore, error) {
	switch strings.ToLower(strings.TrimSpace(backend)) {
	case "", "local":
		return NewLocalStore(localPath, encryptionKey)
	case "s3":
		return NewS3Store(S3ConfigFromEnv(), encryptionKey)
	default:
		return nil, fmt.Errorf("unknown STORAGE_BACKEND %q", backend)
	}
}
