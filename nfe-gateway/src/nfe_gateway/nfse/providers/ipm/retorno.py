"""Retorno do webservice IPM → resultado canônico.

Formato (NTE 35/2021 §3.3/§4.6, NTE 122/2025 §3.2)::

    <retorno>
      <mensagem><codigo>00001 - Sucesso</codigo></mensagem>
      ... numero_nfse, serie_nfse, data_nfse, hora_nfse,
          situacao_codigo_nfse (1 emitida, 2 cancelada),
          link_nfse, cod_verificador_autenticidade
    </retorno>

As tags podem vir em ``<nfse><nf>`` (retorno completo) ou direto na raiz
(retorno reduzido); a busca é por nome local em qualquer profundidade.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from lxml import etree

# Códigos de usuário/login/privilégio (NTE 35/2021 §5).
AUTH_CODES = frozenset({131, 132, 133, 134, 135, 136, 137, 138, 139, 144, 145})

_CODE_RE = re.compile(r"^\s*\[?\s*(\d{1,5})\s*\]?\s*[-–:]?\s*(.*)$", re.DOTALL)


@dataclass
class IpmMessage:
    code: int | None
    text: str

    @property
    def label(self) -> str:
        if self.code is None:
            return self.text
        return f"{self.code:05d} - {self.text}" if self.text else f"{self.code:05d}"


@dataclass
class IpmRetorno:
    messages: list[IpmMessage] = field(default_factory=list)
    numero_nfse: str = ""
    serie_nfse: str = ""
    data_nfse: str = ""
    hora_nfse: str = ""
    situacao_codigo: str = ""
    situacao_descricao: str = ""
    link_nfse: str = ""
    cod_verificador: str = ""
    parse_error: str = ""

    @property
    def first_code(self) -> int | None:
        for m in self.messages:
            if m.code is not None:
                return m.code
        return None

    @property
    def message_text(self) -> str:
        return " | ".join(m.label for m in self.messages if m.label)

    @property
    def is_success_code(self) -> bool:
        return self.first_code == 1


def _first_text(root: etree._Element, name: str) -> str:
    for el in root.iter():
        if not isinstance(el.tag, str):
            continue
        if etree.QName(el).localname.lower() == name.lower() and el.text and el.text.strip():
            return el.text.strip()
    return ""


def parse_message(raw: str) -> IpmMessage:
    m = _CODE_RE.match(raw or "")
    if m:
        return IpmMessage(code=int(m.group(1)), text=m.group(2).strip())
    return IpmMessage(code=None, text=(raw or "").strip())


def parse_retorno(content: bytes) -> IpmRetorno:
    if not content or not content.strip():
        return IpmRetorno(parse_error="resposta vazia da IPM")
    try:
        root = etree.fromstring(content, parser=etree.XMLParser(recover=True, resolve_entities=False))
    except etree.XMLSyntaxError as exc:
        return IpmRetorno(parse_error=f"resposta da IPM não é XML: {exc}")
    if root is None:
        snippet = content[:300].decode("utf-8", errors="replace")
        return IpmRetorno(parse_error=f"resposta da IPM não é XML: {snippet}")

    out = IpmRetorno()
    for el in root.iter():
        if not isinstance(el.tag, str):
            continue
        if etree.QName(el).localname.lower() == "codigo" and el.text and el.text.strip():
            parent = el.getparent()
            if parent is not None and etree.QName(parent).localname.lower() == "mensagem":
                out.messages.append(parse_message(el.text))
    out.numero_nfse = _first_text(root, "numero_nfse")
    out.serie_nfse = _first_text(root, "serie_nfse")
    out.data_nfse = _first_text(root, "data_nfse")
    out.hora_nfse = _first_text(root, "hora_nfse")
    out.situacao_codigo = _first_text(root, "situacao_codigo_nfse")
    out.situacao_descricao = _first_text(root, "situacao_descricao_nfse")
    out.link_nfse = _first_text(root, "link_nfse")
    out.cod_verificador = _first_text(root, "cod_verificador_autenticidade")
    return out


def looks_like_test_validation(ret: IpmRetorno) -> bool:
    """``<nfse_teste>1``: a IPM sempre devolve erro; se o XML está correto a
    mensagem diz que a nota é válida."""
    found = False
    for msg in ret.messages:
        t = msg.text.casefold()
        if "inválid" in t or "invalid" in t:
            return False
        if "válid" in t or "valid" in t:
            found = True
    return found
