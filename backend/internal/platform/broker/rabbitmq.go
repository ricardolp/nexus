package broker

import (
	"context"
	"fmt"
	"log/slog"

	amqp "github.com/rabbitmq/amqp091-go"
)

// exchangeName is the single topic exchange every publisher/consumer in the
// system shares (Go workers today, the nfe-gateway Python service once it
// exists — see docs/architecture/22_nfe_gateway_service.md). Routing key ==
// event type (e.g. "fiscal.document.received.v1"), same string already used
// as the CloudEvents "type" field.
const exchangeName = "fiscal.events"

// RabbitMQBroker is the cross-process Publisher/Subscriber backed by a
// durable topic exchange. Queue naming for Subscribe is 1:1 with the topic
// (queue name == routing key): every current consumer wants its own
// competing-consumer queue per event type, not fan-out to multiple distinct
// consumer groups on the same topic. If that changes, this is the place to
// add an explicit queue name parameter instead of deriving it from topic.
type RabbitMQBroker struct {
	conn   *amqp.Connection
	pubCh  *amqp.Channel
	logger *slog.Logger
}

// NewRabbitMQBroker connects to url and declares the shared topic exchange.
// The connection auto-reconnect is intentionally NOT handled here — callers
// (cmd/* mains) already run inside a supervised process that gets restarted
// on crash, so a hard failure on disconnect is preferable to silently
// swallowing a broken link. Reconnect-with-backoff is a reasonable future
// addition if this becomes a real operational pain point.
func NewRabbitMQBroker(url string, logger *slog.Logger) (*RabbitMQBroker, error) {
	if logger == nil {
		logger = slog.Default()
	}
	conn, err := amqp.Dial(url)
	if err != nil {
		return nil, fmt.Errorf("connect to rabbitmq: %w", err)
	}
	ch, err := conn.Channel()
	if err != nil {
		_ = conn.Close()
		return nil, fmt.Errorf("open rabbitmq channel: %w", err)
	}
	if err := ch.ExchangeDeclare(exchangeName, amqp.ExchangeTopic, true, false, false, false, nil); err != nil {
		_ = ch.Close()
		_ = conn.Close()
		return nil, fmt.Errorf("declare exchange %s: %w", exchangeName, err)
	}
	return &RabbitMQBroker{conn: conn, pubCh: ch, logger: logger}, nil
}

func (b *RabbitMQBroker) Close() error {
	if b.pubCh != nil {
		_ = b.pubCh.Close()
	}
	if b.conn != nil {
		return b.conn.Close()
	}
	return nil
}

func (b *RabbitMQBroker) Publish(ctx context.Context, topic string, payload []byte) error {
	return b.pubCh.PublishWithContext(ctx, exchangeName, topic, false, false, amqp.Publishing{
		ContentType:  "application/json",
		DeliveryMode: amqp.Persistent,
		Body:         payload,
	})
}

// Subscribe declares a durable queue named after topic, binds it to the
// shared exchange with topic as the routing key, and consumes it on a
// dedicated channel in a background goroutine until ctx is cancelled.
// Delivery is at-least-once: handler must be idempotent (mirrors the
// inbox_events dedup pattern already used elsewhere — see
// docs/architecture/08_messaging_and_workers.md). A handler error nacks the
// message with requeue=true; RabbitMQ's own retry/backoff is not configured
// here, so a permanently-failing message will spin until a dead-letter
// policy is added at the queue level.
func (b *RabbitMQBroker) Subscribe(ctx context.Context, topic string, handler func(ctx context.Context, msg Message) error) error {
	ch, err := b.conn.Channel()
	if err != nil {
		return fmt.Errorf("open rabbitmq consumer channel: %w", err)
	}
	if err := ch.ExchangeDeclare(exchangeName, amqp.ExchangeTopic, true, false, false, false, nil); err != nil {
		_ = ch.Close()
		return fmt.Errorf("declare exchange %s: %w", exchangeName, err)
	}
	queue, err := ch.QueueDeclare(topic, true, false, false, false, nil)
	if err != nil {
		_ = ch.Close()
		return fmt.Errorf("declare queue %s: %w", topic, err)
	}
	if err := ch.QueueBind(queue.Name, topic, exchangeName, false, nil); err != nil {
		_ = ch.Close()
		return fmt.Errorf("bind queue %s to %s: %w", queue.Name, topic, err)
	}
	if err := ch.Qos(10, 0, false); err != nil {
		_ = ch.Close()
		return fmt.Errorf("set qos: %w", err)
	}

	deliveries, err := ch.Consume(queue.Name, "", false, false, false, false, nil)
	if err != nil {
		_ = ch.Close()
		return fmt.Errorf("consume queue %s: %w", queue.Name, err)
	}

	go func() {
		defer ch.Close()
		for {
			select {
			case <-ctx.Done():
				return
			case delivery, ok := <-deliveries:
				if !ok {
					return
				}
				if err := handler(ctx, Message{Topic: topic, Payload: delivery.Body}); err != nil {
					b.logger.Error("broker_handler_error", "topic", topic, "error", err)
					_ = delivery.Nack(false, true)
					continue
				}
				_ = delivery.Ack(false)
			}
		}
	}()

	return nil
}
