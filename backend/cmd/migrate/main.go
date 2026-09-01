package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
)

func main() {
	direction := flag.String("direction", "up", "up or down")
	flag.Parse()

	_ = godotenv.Load()
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		log.Fatal("DATABASE_URL is required")
	}

	ctx := context.Background()
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		log.Fatalf("connect: %v", err)
	}
	defer pool.Close()

	if _, err := pool.Exec(ctx, `
		create table if not exists schema_migrations (
			filename text primary key,
			applied_at timestamptz not null default now()
		)
	`); err != nil {
		log.Fatalf("ensure migrations table: %v", err)
	}

	files, err := filepath.Glob("migrations/*.sql")
	if err != nil {
		log.Fatal(err)
	}
	sort.Strings(files)

	switch *direction {
	case "up":
		for _, file := range files {
			var exists bool
			name := filepath.Base(file)
			if err := pool.QueryRow(ctx, `select exists(select 1 from schema_migrations where filename = $1)`, name).Scan(&exists); err != nil {
				log.Fatal(err)
			}
			if exists {
				fmt.Printf("skip %s\n", name)
				continue
			}
			sqlBytes, err := os.ReadFile(file)
			if err != nil {
				log.Fatal(err)
			}
			upSQL := extractSection(string(sqlBytes), "Up")
			if _, err := pool.Exec(ctx, upSQL); err != nil {
				log.Fatalf("apply %s: %v", name, err)
			}
			if _, err := pool.Exec(ctx, `insert into schema_migrations(filename) values ($1)`, name); err != nil {
				log.Fatal(err)
			}
			fmt.Printf("applied %s\n", name)
		}
	case "down":
		for i := len(files) - 1; i >= 0; i-- {
			file := files[i]
			name := filepath.Base(file)
			var exists bool
			if err := pool.QueryRow(ctx, `select exists(select 1 from schema_migrations where filename = $1)`, name).Scan(&exists); err != nil {
				log.Fatal(err)
			}
			if !exists {
				continue
			}
			sqlBytes, err := os.ReadFile(file)
			if err != nil {
				log.Fatal(err)
			}
			downSQL := extractSection(string(sqlBytes), "Down")
			if _, err := pool.Exec(ctx, downSQL); err != nil {
				log.Fatalf("rollback %s: %v", name, err)
			}
			if _, err := pool.Exec(ctx, `delete from schema_migrations where filename = $1`, name); err != nil {
				log.Fatal(err)
			}
			fmt.Printf("rolled back %s\n", name)
		}
	default:
		log.Fatalf("unknown direction %s", *direction)
	}
}

func extractSection(sql, section string) string {
	marker := "-- +migrate " + section
	idx := strings.Index(sql, marker)
	if idx < 0 {
		return sql
	}
	rest := sql[idx+len(marker):]
	if next := strings.Index(rest, "-- +migrate "); next >= 0 {
		rest = rest[:next]
	}
	return strings.TrimSpace(rest)
}
