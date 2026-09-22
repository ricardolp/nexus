package main

import "testing"

func TestExtractSectionOmitsDownWhenUpMarkerMissing(t *testing.T) {
	sql := `
create table foo (id int);
-- +migrate Down
drop table foo;
`
	up := extractSection(sql, "Up")
	if up != "create table foo (id int);" {
		t.Fatalf("up = %q", up)
	}
	down := extractSection(sql, "Down")
	if down != "drop table foo;" {
		t.Fatalf("down = %q", down)
	}
}

func TestExtractSectionWithBothMarkers(t *testing.T) {
	sql := `
-- +migrate Up
create table foo (id int);
-- +migrate Down
drop table foo;
`
	up := extractSection(sql, "Up")
	if up != "create table foo (id int);" {
		t.Fatalf("up = %q", up)
	}
	down := extractSection(sql, "Down")
	if down != "drop table foo;" {
		t.Fatalf("down = %q", down)
	}
}

func TestExtractSectionWholeFileWhenNoMarkers(t *testing.T) {
	sql := "alter table foo add column bar int;"
	up := extractSection(sql, "Up")
	if up != sql {
		t.Fatalf("up = %q", up)
	}
	if down := extractSection(sql, "Down"); down != "" {
		t.Fatalf("down = %q", down)
	}
}
