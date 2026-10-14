"""Contrato dos provedores municipais de NFS-e.

Cada provedor traduz o JSON canônico (contrato espelho da Focus NFe, o mesmo
que o SAP envia ao inbound_api) para o protocolo do município e devolve um
resultado canônico. Os workers (outbound_consumer / event_consumer) não
conhecem nenhum protocolo: perguntam ao provedor o que ele precisa
(``capabilities``), buscam certificado/credencial só nesse caso e chamam
``emit`` / ``cancel``.

Ver backend/docs/architecture/25_nfse_provedores_municipais.md.

Resultado canônico de ``emit`` (dict):

    outcome            'authorized' | 'rejected' | 'error' | 'retry'
    number             número da NFS-e (quando autorizada)
    verification_code  código de verificação / autenticidade
    access_key         chave de 50 dígitos, quando o provedor tiver (SEFIN)
    protocol           protocolo / id da DPS, quando houver
    cstat, x_motivo    código e mensagem do provedor
    error_code, error_message
    signed_xml         bytes enviados (gravado como provider_request)
    response_xml       bytes recebidos (gravado como sefaz_response)
    http_status        int
    pdf_url            link oficial da NFS-e (opcional)
    pdf_bytes          PDF oficial (opcional; o worker grava no object store)
    ibscbs             IBS/CBS oficial devolvido pelo provedor (opcional)

Resultado canônico de ``cancel`` (dict): outcome 'accepted' | 'rejected',
event_kind='cancel', protocol, cstat, x_motivo, error_message, signed_xml,
response_xml.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal, Protocol

CredentialsKind = Literal["none", "basic"]
IdentifiesBy = Literal["access_key", "number"]
HomologationMode = Literal["environment", "test_flag"]


@dataclass(frozen=True)
class ProviderCapabilities:
    needs_certificate: bool
    credentials: CredentialsKind = "none"
    identifies_by: IdentifiesBy = "access_key"
    homologation: HomologationMode = "environment"


@dataclass(frozen=True)
class ProviderCredentials:
    username: str
    password: str = field(repr=False)


@dataclass
class EmitRequest:
    payload: dict[str, Any]
    homologacao: bool
    document_id: str = ""
    config: dict[str, Any] = field(default_factory=dict)
    pfx: bytes | None = field(default=None, repr=False)
    credentials: ProviderCredentials | None = None


@dataclass
class CancelRequest:
    homologacao: bool
    document_id: str = ""
    config: dict[str, Any] = field(default_factory=dict)
    cnpj: str = ""
    municipality_code: str = ""
    access_key: str = ""
    nfse_number: str = ""
    nfse_series: str = ""
    c_motivo: str = ""
    justificativa: str = ""
    pfx: bytes | None = field(default=None, repr=False)
    credentials: ProviderCredentials | None = None


class ProviderConfigError(ValueError):
    """provider_config do catálogo incompleto ou inválido para o provedor."""


class NfseProvider(Protocol):
    code: str

    def capabilities(self, config: dict[str, Any]) -> ProviderCapabilities: ...

    def emit(self, req: EmitRequest) -> dict[str, Any]: ...

    def cancel(self, req: CancelRequest) -> dict[str, Any]: ...


def mapper_rejection(message: str, *, code: str = "mapper_error") -> dict[str, Any]:
    """Resultado canônico para payload que não pode ser traduzido."""
    return {
        "outcome": "rejected",
        "error_code": code,
        "error_message": message,
        "cstat": code,
        "x_motivo": message,
    }
