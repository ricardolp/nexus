package broker

import (
	"fmt"
	"log/slog"
)

// Bus is what cmd/* mains need: publish, subscribe, and a way to release
// the underlying connection on shutdown. MemoryBroker satisfies it with a
// no-op Close so callers don't need to special-case the backend.
type Bus interface {
	Publisher
	Subscriber
	Close() error
}

type memoryBrokerCloser struct{ *MemoryBroker }

func (memoryBrokerCloser) Close() error { return nil }

// Resolve picks the Bus implementation from cfg.BrokerBackend ("memory",
// the default for local dev without RabbitMQ running, or "rabbitmq").
// Mirrors sap.Resolve's pick-an-implementation shape.
func Resolve(backend, rabbitMQURL string, logger *slog.Logger) (Bus, error) {
	switch backend {
	case "", "memory":
		return memoryBrokerCloser{NewMemoryBroker()}, nil
	case "rabbitmq":
		return NewRabbitMQBroker(rabbitMQURL, logger)
	default:
		return nil, fmt.Errorf("unknown BROKER_BACKEND %q", backend)
	}
}
