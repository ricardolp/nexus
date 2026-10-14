"""Registro de provedores municipais de NFS-e (code -> adapter).

Para plugar um sistema municipal novo: criar ``providers/<codigo>/``,
implementar ``NfseProvider`` e registrar aqui. O código precisa ser o mesmo
usado no catálogo ``nfse_municipal_providers`` e em
``backend/internal/nfseprovider/descriptors.go``.
"""

from __future__ import annotations

from nfe_gateway.nfse.providers.base import NfseProvider

DEFAULT_PROVIDER = "sefin_nacional"

_PROVIDERS: dict[str, NfseProvider] = {}


class UnknownProviderError(LookupError):
    pass


def register(provider: NfseProvider) -> NfseProvider:
    _PROVIDERS[provider.code] = provider
    return provider


def normalize_code(code: str | None) -> str:
    return (code or "").strip().lower() or DEFAULT_PROVIDER


def get_provider(code: str | None) -> NfseProvider:
    _ensure_builtin()
    key = normalize_code(code)
    try:
        return _PROVIDERS[key]
    except KeyError as exc:
        raise UnknownProviderError(
            f"Provedor de NFS-e '{key}' não está implementado no nfe-gateway "
            f"(disponíveis: {', '.join(sorted(_PROVIDERS))})."
        ) from exc


def codes() -> list[str]:
    _ensure_builtin()
    return sorted(_PROVIDERS)


_loaded = False


def _ensure_builtin() -> None:
    global _loaded
    if _loaded:
        return
    _loaded = True
    from nfe_gateway.nfse.providers.ipm import IpmProvider
    from nfe_gateway.nfse.providers.sefin_nacional import SefinNacionalProvider

    register(SefinNacionalProvider())
    register(IpmProvider())
