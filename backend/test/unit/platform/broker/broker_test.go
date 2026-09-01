package broker_test

import (
	"context"
	"sync/atomic"
	"testing"

	"github.com/nexus/fiscal-messaging/internal/platform/broker"
)

func TestMemoryBrokerPublishSubscribe(t *testing.T) {
	t.Parallel()

	bus := broker.NewMemoryBroker()
	var called atomic.Int32

	err := bus.Subscribe(context.Background(), "fiscal.document.received.v1", func(ctx context.Context, msg broker.Message) error {
		called.Add(1)
		if string(msg.Payload) != `{"ok":true}` {
			t.Fatalf("payload=%s", msg.Payload)
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}

	if err := bus.Publish(context.Background(), "fiscal.document.received.v1", []byte(`{"ok":true}`)); err != nil {
		t.Fatal(err)
	}
	if called.Load() != 1 {
		t.Fatalf("called=%d", called.Load())
	}
}
