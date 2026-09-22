package llm

import "testing"

func TestNewDisabledWithoutKey(t *testing.T) {
	t.Parallel()
	if New(Config{}) != nil {
		t.Fatal("expected nil client without API key")
	}
	c := New(Config{APIKey: "sk-test", Model: "gpt-test"})
	if c == nil || !c.Enabled() || c.Model() != "gpt-test" {
		t.Fatalf("unexpected client: %+v", c)
	}
}
