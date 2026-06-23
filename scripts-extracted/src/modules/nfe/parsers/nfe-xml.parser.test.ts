import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseNfeXml,
  parseNfeXmlDetail,
  resolveOrganizationCompanyDocument,
} from "./nfe-xml.parser.js";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

function loadFixture(name: string): Buffer {
  return readFileSync(join(rootDir, name));
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function testEntrada() {
  const parsed = parseNfeXml(loadFixture("nfe_entrada_152756.xml"));
  assert(parsed.direction === "inbound", "entrada deve ser inbound");
  assert(parsed.number === 70398, "número da nota de entrada");
  assert(parsed.series === 1, "série da nota de entrada");
  assert(parsed.status === "received", "sem protNFe deve ser received");
  assert(parsed.accessKey.length >= 43 && parsed.accessKey.length <= 44, "chave de acesso válida");
  assert(
    resolveOrganizationCompanyDocument(parsed) === "13677964000200",
    "CNPJ da empresa na entrada"
  );
}

function testSaida() {
  const parsed = parseNfeXml(loadFixture("nf.xml"));
  assert(parsed.direction === "outbound", "saída deve ser outbound");
  assert(parsed.number === 77508, "número da nota de saída");
  assert(parsed.series === 2, "série da nota de saída");
  assert(parsed.status === "received", "sem protNFe deve ser received");
  assert(
    resolveOrganizationCompanyDocument(parsed) === "13677964000200",
    "CNPJ da empresa na saída"
  );
}

function testDetailEntrada() {
  const detail = parseNfeXmlDetail(loadFixture("nfe_entrada_152756.xml"));
  assert(detail.itens.length === 3, "nota de entrada com 3 itens");
  assert(detail.valorProdutos > 0, "valorProdutos do XML");
  assert(detail.emitente.razaoSocial.includes("POLIFILTRO"), "razão social emitente");
  assert(detail.destinatario.document === "13677964000200", "CNPJ destinatário");
  assert(detail.impostos.some((i) => i.tipo === "ICMS"), "imposto ICMS agregado");
}

testEntrada();
testSaida();
function testXPedOnItem() {
  const detail = parseNfeXmlDetail(loadFixture("42260522479375000119550010000197301906383658.xml"));
  assert(detail.itens.length === 1, "nota com 1 item");
  assert(detail.itens[0]?.xPed === "4504342366", "xPed no prod");
  assert(detail.itens[0]?.nItemPed === "30", "nItemPed no prod");
}

testDetailEntrada();
testXPedOnItem();
console.log("nfe-xml.parser tests passed");
