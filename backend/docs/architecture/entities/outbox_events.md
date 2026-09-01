# `outbox_events`

Eventos gravados na mesma transação dos dados de negócio.

O relay publica no broker e marca o evento como publicado. Nunca publicar diretamente e depois tentar gravar o documento.
