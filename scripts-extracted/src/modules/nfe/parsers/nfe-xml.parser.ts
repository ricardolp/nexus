import { XMLParser } from "fast-xml-parser";
import { AppError } from "../../../common/http/errors.js";

export type ParsedNfeDirection = "inbound" | "outbound";
export type ParsedNfeEnvironment = "production" | "homologation";
export type ParsedNfeStatus = "received" | "authorized" | "rejected" | "denied";

export type ParsedNfeXml = {
  accessKey: string;
  model: string;
  series: number;
  number: number;
  issuedAt: Date;
  direction: ParsedNfeDirection;
  environment: ParsedNfeEnvironment;
  issuerCnpj: string;
  recipientDocument: string | null;
  recipientName: string | null;
  totalAmount: string;
  status: ParsedNfeStatus;
  authorizationProtocol: string | null;
  authorizedAt: Date | null;
  sefazStatusCode: string | null;
  sefazStatusMessage: string | null;
  natOp: string | null;
  verProc: string | null;
};

export type ParsedNfeParte = {
  razaoSocial: string;
  document: string;
  ie: string;
  email?: string;
  endereco: string;
};

export type ParsedNfeItem = {
  item: number;
  codigo: string;
  descricao: string;
  ncm: string;
  cfop: string;
  quantidade: number;
  unidade: string;
  valorUnitario: number;
  valorTotal: number;
  icms: number;
  xPed?: string;
  nItemPed?: string;
};

export type ParsedNfeImposto = {
  tipo: string;
  baseCalculo: number;
  aliquota: number;
  valor: number;
};

export type ParsedNfeXmlDetail = ParsedNfeXml & {
  valorProdutos: number;
  valorIcms: number;
  emitente: ParsedNfeParte;
  destinatario: ParsedNfeParte;
  itens: ParsedNfeItem[];
  impostos: ParsedNfeImposto[];
};

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  trimValues: true,
  parseTagValue: false,
});

function digitsOnly(value: unknown): string {
  if (value == null) return "";
  return String(value).replace(/\D/g, "");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function pickString(obj: Record<string, unknown> | null, key: string): string | null {
  if (!obj) return null;
  const v = obj[key];
  if (v == null) return null;
  return String(v);
}

function pickNumber(obj: Record<string, unknown> | null, key: string): number | null {
  const s = pickString(obj, key);
  if (s == null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function parseDate(value: unknown): Date | null {
  if (value == null) return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

function extractAccessKey(infNFe: Record<string, unknown>): string {
  const id = pickString(infNFe, "@_Id") ?? pickString(infNFe, "Id");
  if (!id) throw new AppError("nfe_xml_invalid", 400);
  const key = id.startsWith("NFe") ? id.slice(3) : id;
  if (!/^\d{43,44}$/.test(key)) {
    throw new AppError("nfe_xml_invalid", 400);
  }
  return key;
}

function resolveInfNFe(root: Record<string, unknown>): {
  infNFe: Record<string, unknown>;
  protInf: Record<string, unknown> | null;
} {
  if (root.NFe) {
    const nfe = asRecord(root.NFe);
    const infNFe = asRecord(nfe?.infNFe);
    if (!infNFe) throw new AppError("nfe_xml_invalid", 400);
    return { infNFe, protInf: null };
  }

  if (root.nfeProc) {
    const proc = asRecord(root.nfeProc);
    const nfe = asRecord(proc?.NFe);
    const infNFe = asRecord(nfe?.infNFe);
    if (!infNFe) throw new AppError("nfe_xml_invalid", 400);
    const protNFe = asRecord(proc?.protNFe);
    const protInf = asRecord(protNFe?.infProt);
    return { infNFe, protInf };
  }

  throw new AppError("nfe_xml_invalid", 400);
}

function mapDirection(tpNF: string | null): ParsedNfeDirection {
  if (tpNF === "0") return "inbound";
  if (tpNF === "1") return "outbound";
  throw new AppError("nfe_xml_invalid", 400);
}

function mapEnvironment(tpAmb: string | null): ParsedNfeEnvironment {
  if (tpAmb === "1") return "production";
  if (tpAmb === "2") return "homologation";
  throw new AppError("nfe_xml_invalid", 400);
}

function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function pickDecimal(obj: Record<string, unknown> | null, key: string): number {
  const n = Number(pickString(obj, key) ?? "0");
  return Number.isFinite(n) ? n : 0;
}

function formatCep(cep: string): string {
  const d = digitsOnly(cep);
  if (d.length !== 8) return cep;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

function formatEndereco(ender: Record<string, unknown> | null): string {
  if (!ender) return "Endereço não informado";
  const street = [pickString(ender, "xLgr"), pickString(ender, "nro")].filter(Boolean).join(", ");
  const city = [pickString(ender, "xMun"), pickString(ender, "UF")].filter(Boolean).join(" - ");
  const parts = [street, pickString(ender, "xBairro"), city].filter(Boolean);
  const cep = pickString(ender, "CEP");
  let line = parts.join(", ");
  if (cep) line += `, CEP ${formatCep(cep)}`;
  return line || "Endereço não informado";
}

function parseParte(
  party: Record<string, unknown> | null,
  enderKey: "enderEmit" | "enderDest"
): ParsedNfeParte {
  if (!party) {
    return {
      razaoSocial: "Não informado",
      document: "",
      ie: "ISENTO",
      endereco: "Endereço não informado",
    };
  }

  const document =
    digitsOnly(pickString(party, "CNPJ")) || digitsOnly(pickString(party, "CPF")) || "";
  const ieRaw = pickString(party, "IE");
  const email = pickString(party, "email") ?? undefined;

  return {
    razaoSocial: pickString(party, "xNome") ?? "Não informado",
    document,
    ie: ieRaw?.trim() ? ieRaw.trim() : "ISENTO",
    email,
    endereco: formatEndereco(asRecord(party[enderKey])),
  };
}

function findItemIcms(imposto: Record<string, unknown> | null): number {
  if (!imposto) return 0;
  const icms = asRecord(imposto.ICMS);
  if (!icms) return 0;
  for (const value of Object.values(icms)) {
    const group = asRecord(value);
    const v = pickDecimal(group, "vICMS");
    if (v > 0) return v;
  }
  return 0;
}

function parseItems(infNFe: Record<string, unknown>): ParsedNfeItem[] {
  const compra = asRecord(infNFe.compra);
  const headerXPed = pickString(compra, "xPed")?.trim() || undefined;

  return asArray(infNFe.det)
    .map((detRaw, index) => {
      const det = asRecord(detRaw);
      if (!det) return null;
      const prod = asRecord(det.prod);
      if (!prod) return null;

      const nItemAttr = pickString(det, "@_nItem");
      const item = nItemAttr ? Number(nItemAttr) : index + 1;
      const ncm = pickString(prod, "NCM") ?? "";
      const cfop = pickString(prod, "CFOP") ?? "";
      const xPed = pickString(prod, "xPed")?.trim() || headerXPed;
      const nItemPed = pickString(prod, "nItemPed")?.trim() || undefined;

      return {
        item: Number.isFinite(item) ? item : index + 1,
        codigo: pickString(prod, "cProd") ?? "",
        descricao: pickString(prod, "xProd") ?? "",
        ncm,
        cfop,
        quantidade: pickDecimal(prod, "qCom"),
        unidade: pickString(prod, "uCom") ?? "UN",
        valorUnitario: pickDecimal(prod, "vUnCom"),
        valorTotal: pickDecimal(prod, "vProd"),
        icms: findItemIcms(asRecord(det.imposto)),
        ...(xPed ? { xPed } : {}),
        ...(nItemPed ? { nItemPed } : {}),
      };
    })
    .filter((item): item is ParsedNfeItem => item !== null)
    .sort((a, b) => a.item - b.item);
}

function buildImposto(
  tipo: string,
  baseCalculo: number,
  valor: number
): ParsedNfeImposto | null {
  if (valor <= 0) return null;
  const aliquota =
    baseCalculo > 0 ? Math.round((valor / baseCalculo) * 10000) / 100 : 0;
  return { tipo, baseCalculo: roundMoney(baseCalculo), aliquota, valor: roundMoney(valor) };
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function parseImpostos(icmsTot: Record<string, unknown> | null): ParsedNfeImposto[] {
  if (!icmsTot) return [];
  const baseProd = pickDecimal(icmsTot, "vProd");
  const baseIcms = pickDecimal(icmsTot, "vBC");

  const entries = [
    buildImposto("ICMS", baseIcms || baseProd, pickDecimal(icmsTot, "vICMS")),
    buildImposto("PIS", baseProd, pickDecimal(icmsTot, "vPIS")),
    buildImposto("COFINS", baseProd, pickDecimal(icmsTot, "vCOFINS")),
    buildImposto("IPI", baseProd, pickDecimal(icmsTot, "vIPI")),
  ];

  return entries.filter((e): e is ParsedNfeImposto => e !== null);
}

function mapStatusFromProtocol(protInf: Record<string, unknown> | null): {
  status: ParsedNfeStatus;
  authorizationProtocol: string | null;
  authorizedAt: Date | null;
  sefazStatusCode: string | null;
  sefazStatusMessage: string | null;
} {
  if (!protInf) {
    return {
      status: "received",
      authorizationProtocol: null,
      authorizedAt: null,
      sefazStatusCode: null,
      sefazStatusMessage: null,
    };
  }

  const cStat = pickString(protInf, "cStat");
  const xMotivo = pickString(protInf, "xMotivo");
  const nProt = pickString(protInf, "nProt");
  const dhRecbto = parseDate(protInf.dhRecbto);

  if (cStat === "100") {
    return {
      status: "authorized",
      authorizationProtocol: nProt,
      authorizedAt: dhRecbto,
      sefazStatusCode: cStat,
      sefazStatusMessage: xMotivo,
    };
  }

  if (cStat === "110" || cStat === "301" || cStat === "302") {
    return {
      status: "denied",
      authorizationProtocol: null,
      authorizedAt: null,
      sefazStatusCode: cStat,
      sefazStatusMessage: xMotivo,
    };
  }

  return {
    status: "rejected",
    authorizationProtocol: null,
    authorizedAt: null,
    sefazStatusCode: cStat,
    sefazStatusMessage: xMotivo,
  };
}

function parseInfNFeXml(raw: string): {
  header: ParsedNfeXml;
  emitente: ParsedNfeParte;
  destinatario: ParsedNfeParte;
  itens: ParsedNfeItem[];
  impostos: ParsedNfeImposto[];
  valorProdutos: number;
  valorIcms: number;
} {
  if (!raw.trim()) throw new AppError("nfe_xml_invalid", 400);

  let parsed: unknown;
  try {
    parsed = xmlParser.parse(raw);
  } catch {
    throw new AppError("nfe_xml_invalid", 400);
  }

  const root = asRecord(parsed);
  if (!root) throw new AppError("nfe_xml_invalid", 400);

  const { infNFe, protInf } = resolveInfNFe(root);
  const ide = asRecord(infNFe.ide);
  const emit = asRecord(infNFe.emit);
  const dest = asRecord(infNFe.dest);
  const total = asRecord(infNFe.total);
  const icmsTot = asRecord(total?.ICMSTot);

  const accessKey = extractAccessKey(infNFe);
  const model = pickString(ide, "mod");
  const series = pickNumber(ide, "serie");
  const number = pickNumber(ide, "nNF");
  const issuedAt = parseDate(ide?.dhEmi);
  const issuerCnpj = digitsOnly(pickString(emit, "CNPJ"));
  const recipientDocument =
    digitsOnly(pickString(dest, "CNPJ")) || digitsOnly(pickString(dest, "CPF")) || null;
  const totalAmount = pickString(icmsTot, "vNF");

  if (!model || series == null || number == null || !issuedAt || !issuerCnpj || !totalAmount) {
    throw new AppError("nfe_xml_invalid", 400);
  }

  const direction = mapDirection(pickString(ide, "tpNF"));
  const environment = mapEnvironment(pickString(ide, "tpAmb"));
  const protocolFields = mapStatusFromProtocol(protInf);
  const valorProdutos = pickDecimal(icmsTot, "vProd");
  const valorIcms = pickDecimal(icmsTot, "vICMS");

  const header: ParsedNfeXml = {
    accessKey,
    model,
    series,
    number,
    issuedAt,
    direction,
    environment,
    issuerCnpj,
    recipientDocument: recipientDocument || null,
    recipientName: pickString(dest, "xNome"),
    totalAmount,
    status: protocolFields.status,
    authorizationProtocol: protocolFields.authorizationProtocol,
    authorizedAt: protocolFields.authorizedAt,
    sefazStatusCode: protocolFields.sefazStatusCode,
    sefazStatusMessage: protocolFields.sefazStatusMessage,
    natOp: pickString(ide, "natOp"),
    verProc: pickString(ide, "verProc"),
  };

  return {
    header,
    emitente: parseParte(emit, "enderEmit"),
    destinatario: parseParte(dest, "enderDest"),
    itens: parseItems(infNFe),
    impostos: parseImpostos(icmsTot),
    valorProdutos,
    valorIcms,
  };
}

export function parseNfeXml(xml: string | Buffer): ParsedNfeXml {
  const raw = typeof xml === "string" ? xml : xml.toString("utf8");
  return parseInfNFeXml(raw).header;
}

export function parseNfeXmlDetail(xml: string | Buffer): ParsedNfeXmlDetail {
  const raw = typeof xml === "string" ? xml : xml.toString("utf8");
  const parsed = parseInfNFeXml(raw);
  return {
    ...parsed.header,
    valorProdutos: parsed.valorProdutos,
    valorIcms: parsed.valorIcms,
    emitente: parsed.emitente,
    destinatario: parsed.destinatario,
    itens: parsed.itens,
    impostos: parsed.impostos,
  };
}

/** CNPJ/CPF da empresa da organização conforme o fluxo da nota. */
export function resolveOrganizationCompanyDocument(parsed: ParsedNfeXml): string {
  if (parsed.direction === "outbound") return parsed.issuerCnpj;
  if (!parsed.recipientDocument) throw new AppError("nfe_xml_invalid", 400);
  return parsed.recipientDocument;
}
