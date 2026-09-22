package storage

import (
	"context"
	"fmt"
	"io"
	"os"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/nexus/fiscal-messaging/internal/platform/crypto"
)

// S3Config holds S3-compatible endpoint settings (Railway Buckets, MinIO, etc.).
type S3Config struct {
	Bucket          string
	Endpoint        string
	Region          string
	AccessKeyID     string
	SecretAccessKey string
	// ForcePathStyle is required by some older S3-compatible endpoints.
	ForcePathStyle bool
}

// S3ConfigFromEnv reads Railway Bucket / AWS-style variables.
func S3ConfigFromEnv() S3Config {
	return S3Config{
		Bucket:          firstNonEmpty(os.Getenv("S3_BUCKET"), os.Getenv("AWS_S3_BUCKET_NAME"), os.Getenv("BUCKET")),
		Endpoint:        firstNonEmpty(os.Getenv("S3_ENDPOINT"), os.Getenv("AWS_ENDPOINT_URL"), os.Getenv("ENDPOINT")),
		Region:          firstNonEmpty(os.Getenv("S3_REGION"), os.Getenv("AWS_DEFAULT_REGION"), os.Getenv("REGION"), "auto"),
		AccessKeyID:     firstNonEmpty(os.Getenv("S3_ACCESS_KEY_ID"), os.Getenv("AWS_ACCESS_KEY_ID"), os.Getenv("ACCESS_KEY_ID")),
		SecretAccessKey: firstNonEmpty(os.Getenv("S3_SECRET_ACCESS_KEY"), os.Getenv("AWS_SECRET_ACCESS_KEY"), os.Getenv("SECRET_ACCESS_KEY")),
		ForcePathStyle:  strings.EqualFold(os.Getenv("S3_FORCE_PATH_STYLE"), "true") ||
			strings.EqualFold(os.Getenv("AWS_S3_URL_STYLE"), "path"),
	}
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if strings.TrimSpace(v) != "" {
			return strings.TrimSpace(v)
		}
	}
	return ""
}

// S3Store encrypts with SECRETS_ENCRYPTION_KEY before Put and decrypts after Get,
// matching LocalStore's wire format so objects remain opaque at rest even when
// the bucket provider already encrypts the blob.
type S3Store struct {
	client *s3.Client
	bucket string
	key    []byte
}

func NewS3Store(cfg S3Config, encryptionKey []byte) (*S3Store, error) {
	if len(encryptionKey) != 32 {
		return nil, fmt.Errorf("storage: SECRETS_ENCRYPTION_KEY (32 bytes) is required for the s3 object store")
	}
	if strings.TrimSpace(cfg.Bucket) == "" {
		return nil, fmt.Errorf("storage: S3 bucket is required")
	}
	if strings.TrimSpace(cfg.AccessKeyID) == "" || strings.TrimSpace(cfg.SecretAccessKey) == "" {
		return nil, fmt.Errorf("storage: S3 access key and secret are required")
	}
	region := strings.TrimSpace(cfg.Region)
	if region == "" {
		region = "auto"
	}
	endpoint := strings.TrimRight(strings.TrimSpace(cfg.Endpoint), "/")
	if endpoint == "" {
		return nil, fmt.Errorf("storage: S3 endpoint is required")
	}

	client := s3.New(s3.Options{
		Region: region,
		Credentials: credentials.NewStaticCredentialsProvider(
			cfg.AccessKeyID, cfg.SecretAccessKey, "",
		),
		BaseEndpoint: aws.String(endpoint),
		UsePathStyle: cfg.ForcePathStyle,
	})
	return &S3Store{client: client, bucket: cfg.Bucket, key: encryptionKey}, nil
}

func (s *S3Store) Put(ctx context.Context, key string, contentType string, data []byte) error {
	encoded, err := crypto.Encrypt(s.key, data)
	if err != nil {
		return fmt.Errorf("encrypt object %s: %w", key, err)
	}
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	_, err = s.client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(s.bucket),
		Key:         aws.String(key),
		Body:        strings.NewReader(encoded),
		ContentType: aws.String(contentType),
	})
	if err != nil {
		return fmt.Errorf("put object %s: %w", key, err)
	}
	return nil
}

func (s *S3Store) Get(ctx context.Context, key string) ([]byte, error) {
	out, err := s.client.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		return nil, fmt.Errorf("get object %s: %w", key, err)
	}
	defer out.Body.Close()
	raw, err := io.ReadAll(out.Body)
	if err != nil {
		return nil, fmt.Errorf("read object %s: %w", key, err)
	}
	data, err := crypto.Decrypt(s.key, string(raw))
	if err != nil {
		return nil, fmt.Errorf("decrypt object %s: %w", key, err)
	}
	return data, nil
}

func (s *S3Store) Delete(ctx context.Context, key string) error {
	_, err := s.client.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		return fmt.Errorf("delete object %s: %w", key, err)
	}
	return nil
}
