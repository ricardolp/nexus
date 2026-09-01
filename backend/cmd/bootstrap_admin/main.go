package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"os"

	"github.com/joho/godotenv"
	"github.com/nexus/fiscal-messaging/internal/identity"
	"github.com/nexus/fiscal-messaging/internal/platform/db"
	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
)

func main() {
	_ = godotenv.Load()
	databaseURL := os.Getenv("DATABASE_URL")
	email := os.Getenv("BOOTSTRAP_ADMIN_EMAIL")
	password := os.Getenv("BOOTSTRAP_ADMIN_PASSWORD")
	if databaseURL == "" || email == "" || password == "" {
		log.Fatal("DATABASE_URL, BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD are required")
	}

	ctx := context.Background()
	pool, err := db.Connect(ctx, databaseURL)
	if err != nil {
		log.Fatalf("database: %v", err)
	}
	defer pool.Close()

	user, err := identity.NewService(pool).Register(ctx, identity.RegisterInput{
		Email: email, Password: password, PlatformRole: identity.PlatformRoleAdmin,
	})
	if err != nil {
		var de *domainerr.Error
		if errors.As(err, &de) && de.Code == "email_already_exists" {
			fmt.Printf("bootstrap admin already exists: %s\n", email)
			return
		}
		log.Fatal(err)
	}
	fmt.Printf("bootstrap admin created: %s\n", user.Email)
}
