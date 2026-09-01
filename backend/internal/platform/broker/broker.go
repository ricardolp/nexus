package broker

import (
	"context"
	"sync"
)

type Message struct {
	Topic   string
	Payload []byte
}

type Publisher interface {
	Publish(ctx context.Context, topic string, payload []byte) error
}

type Subscriber interface {
	Subscribe(ctx context.Context, topic string, handler func(ctx context.Context, msg Message) error) error
}

type MemoryBroker struct {
	mu       sync.RWMutex
	handlers map[string][]func(ctx context.Context, msg Message) error
}

func NewMemoryBroker() *MemoryBroker {
	return &MemoryBroker{handlers: make(map[string][]func(ctx context.Context, msg Message) error)}
}

func (b *MemoryBroker) Publish(ctx context.Context, topic string, payload []byte) error {
	b.mu.RLock()
	handlers := append([]func(ctx context.Context, msg Message) error{}, b.handlers[topic]...)
	b.mu.RUnlock()

	msg := Message{Topic: topic, Payload: payload}
	for _, h := range handlers {
		if err := h(ctx, msg); err != nil {
			return err
		}
	}
	return nil
}

func (b *MemoryBroker) Subscribe(_ context.Context, topic string, handler func(ctx context.Context, msg Message) error) error {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.handlers[topic] = append(b.handlers[topic], handler)
	return nil
}
