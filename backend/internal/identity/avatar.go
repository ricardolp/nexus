package identity

import (
	"context"
	"net/http"
	"strings"

	"github.com/google/uuid"
	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
)

const maxAvatarBytes = 5 << 20

func (s *Service) SetAvatar(ctx context.Context, userID uuid.UUID, contentType string, data []byte) error {
	if s.store == nil {
		return domainerr.New(503, "storage_unavailable", "Service Unavailable", "Object storage is not configured")
	}
	if len(data) == 0 {
		return domainerr.Validation("empty_avatar", "avatar file is required")
	}
	if len(data) > maxAvatarBytes {
		return domainerr.Validation("avatar_too_large", "avatar must be at most 5 MB")
	}
	ct := strings.ToLower(strings.TrimSpace(contentType))
	switch ct {
	case "image/jpeg", "image/png", "image/webp", "image/gif":
	default:
		return domainerr.Validation("invalid_avatar_type", "avatar must be JPEG, PNG, GIF or WebP")
	}
	key := "avatars/" + userID.String()
	if err := s.store.Put(ctx, key, ct, data); err != nil {
		return err
	}
	_, err := s.pool.Exec(ctx, `
		update users set avatar_object_key = $2, updated_at = now() where id = $1 and deleted_at is null
	`, userID, key)
	return err
}

func (s *Service) DeleteAvatar(ctx context.Context, userID uuid.UUID) error {
	var key *string
	_ = s.pool.QueryRow(ctx, `select avatar_object_key from users where id = $1`, userID).Scan(&key)
	_, err := s.pool.Exec(ctx, `
		update users set avatar_object_key = null, updated_at = now() where id = $1 and deleted_at is null
	`, userID)
	if err != nil {
		return err
	}
	if s.store != nil && key != nil && strings.TrimSpace(*key) != "" {
		_ = s.store.Delete(ctx, *key)
	}
	return nil
}

func (s *Service) GetAvatar(ctx context.Context, userID uuid.UUID) ([]byte, string, error) {
	if s.store == nil {
		return nil, "", domainerr.New(503, "storage_unavailable", "Service Unavailable", "Object storage is not configured")
	}
	var key *string
	err := s.pool.QueryRow(ctx, `
		select avatar_object_key from users where id = $1 and deleted_at is null
	`, userID).Scan(&key)
	if err != nil || key == nil || strings.TrimSpace(*key) == "" {
		return nil, "", domainerr.NotFound("avatar_not_found", "Avatar not found")
	}
	data, err := s.store.Get(ctx, *key)
	if err != nil {
		return nil, "", domainerr.NotFound("avatar_not_found", "Avatar not found")
	}
	ct := http.DetectContentType(data)
	return data, ct, nil
}
