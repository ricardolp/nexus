-- +migrate Up

-- notified_at guards fiscal.QueryConsumer.HandleQueryResult against creating
-- a duplicate in-app notification on RabbitMQ's at-least-once redelivery of
-- fiscal.document.query_result.v1 — same "claim exactly once via a
-- conditional update" idea as notification.Service.MarkRead's coalesce, just
-- applied to a different column.
alter table fiscal_document_query_requests
    add column notified_at timestamptz;

-- +migrate Down

alter table fiscal_document_query_requests
    drop column if exists notified_at;
