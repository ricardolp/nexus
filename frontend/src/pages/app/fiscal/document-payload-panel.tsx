import { DownloadIcon, FileCode2Icon, FileInputIcon, FileTextIcon } from 'lucide-react';
import { toast } from 'sonner';

import { ApiError } from '@/lib/api';
import { downloadFiscalDocument } from '@/lib/endpoints';
import type { ApiFiscalDocument } from '@/lib/api-types';
import { useAuthStore } from '@/store/auth-store';
import { Button } from '@/components/ui/button';

function hasPayload(document: ApiFiscalDocument, type: string) {
  return (document.payloads ?? []).some((p) => p.payload_type === type);
}

function DownloadRow({
  title,
  hint,
  payloadType,
  documentId,
  disabled
}: {
  title: string;
  hint: string;
  payloadType: string;
  documentId: string;
  disabled?: boolean;
}) {
  const token = useAuthStore((s) => s.token);
  const organizationId = useAuthStore((s) => s.organizationId);

  const handleDownload = async () => {
    if (!token || !organizationId || disabled) return;
    try {
      await downloadFiscalDocument(token, organizationId, documentId, payloadType);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível baixar o arquivo.');
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-muted-foreground text-xs">{hint}</p>
      </div>
      <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={handleDownload}>
        <DownloadIcon />
        Baixar
      </Button>
    </div>
  );
}

export function DocumentPayloadPanel({ document }: { document: ApiFiscalDocument }) {
  const outbound = document.direction.toLowerCase() === 'outbound';
  const isNfse = document.document_type === 'nfse';
  const isNfe = document.document_type === 'nfe';
  const status = document.status.toLowerCase();
  const authorizedLike = ['authorized', 'cancelled', 'correction_registered'].includes(status);
  const sentType = outbound ? 'provider_request' : 'original_request';
  const danfseAvailable = isNfse && outbound && status === 'authorized';
  const nfeAuthorized = isNfe && outbound && authorizedLike;
  const hasCancel = hasPayload(document, 'cancel_response');
  const hasCce = hasPayload(document, 'cce_response');
  const hasProtocol = hasPayload(document, 'protocol');
  const hasInutilization = hasPayload(document, 'inutilization_response');
  const hasManifestation = hasPayload(document, 'manifestation_event');
  const hasDanfe = hasPayload(document, 'danfe');

  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground text-sm">
        O conteúdo XML não é exibido na tela. Use o download para inspecionar o arquivo enviado ou o retorno da
        autoridade. Arquivos autorizados são nomeados com a chave de acesso
        (ex.: <span className="font-mono">NFe{'{chave}'}.xml</span>).
      </p>
      {nfeAuthorized ? (
        <>
          <DownloadRow
            title="XML da NF-e"
            hint="XML autorizado (nfeProc) retornado pela SEFAZ."
            payloadType="sefaz_response"
            documentId={document.id}
          />
          <DownloadRow
            title="XML do protocolo"
            hint={
              hasProtocol
                ? 'Somente o protNFe de autorização.'
                : 'Use “Solicitar protocolo” no detalhe se ainda não estiver disponível.'
            }
            payloadType="protocol"
            documentId={document.id}
            disabled={!hasProtocol}
          />
          <DownloadRow
            title="DANFE (PDF)"
            hint={hasDanfe ? 'DANFE gerada no SAP e enviada à mensageria.' : 'Disponível após o SAP enviar a DANFE.'}
            payloadType="danfe"
            documentId={document.id}
            disabled={!hasDanfe}
          />
          <DownloadRow
            title="XML de cancelamento"
            hint={hasCancel ? 'Evento de cancelamento aceito pela SEFAZ.' : 'Disponível após cancelamento aceito.'}
            payloadType="cancel_response"
            documentId={document.id}
            disabled={!hasCancel}
          />
          <DownloadRow
            title="XML da carta de correção"
            hint={hasCce ? 'Evento de CC-e aceito pela SEFAZ.' : 'Disponível após carta de correção aceita.'}
            payloadType="cce_response"
            documentId={document.id}
            disabled={!hasCce}
          />
          <DownloadRow
            title="XML de inutilização"
            hint={
              hasInutilization
                ? 'Retorno SEFAZ da inutilização vinculada.'
                : 'Disponível após inutilização aceita.'
            }
            payloadType="inutilization_response"
            documentId={document.id}
            disabled={!hasInutilization}
          />
          <DownloadRow
            title="XML da manifestação"
            hint={
              hasManifestation
                ? 'Evento de manifestação do destinatário (DistDFe).'
                : 'Aparece automaticamente quando o destinatário manifesta.'
            }
            payloadType="manifestation_event"
            documentId={document.id}
            disabled={!hasManifestation}
          />
          <DownloadRow
            title="XML de envio"
            hint="XML assinado transmitido à SEFAZ (antes do protocolo)."
            payloadType="provider_request"
            documentId={document.id}
          />
        </>
      ) : (
        <>
          <DownloadRow
            title={outbound ? (isNfse ? 'XML enviado' : 'XML de envio') : 'XML original'}
            hint={
              outbound
                ? isNfse
                  ? 'DPS assinado transmitido ao Portal Nacional da NFS-e.'
                  : 'XML assinado transmitido à SEFAZ.'
                : 'Arquivo XML recebido nesta nota.'
            }
            payloadType={sentType}
            documentId={document.id}
          />
          {outbound && (
            <DownloadRow
              title={isNfse ? 'XML recebido' : 'Retorno da autoridade'}
              hint={
                isNfse
                  ? 'XML da NFS-e autorizada (ou resposta de recusa) retornado pelo SEFIN.'
                  : 'Resposta da SEFAZ (autorização ou recusa).'
              }
              payloadType="sefaz_response"
              documentId={document.id}
            />
          )}
        </>
      )}
      {outbound && isNfse && (
        <DownloadRow
          title="DANFSe (PDF)"
          hint={
            danfseAvailable
              ? 'Documento auxiliar da NFS-e no padrão nacional (v2.0), gerado a partir do XML autorizado.'
              : 'Disponível após autorização da NFS-e.'
          }
          payloadType="danfse"
          documentId={document.id}
          disabled={!danfseAvailable}
        />
      )}
      {outbound && (
        <div className="text-muted-foreground flex items-start gap-2 text-xs">
          <FileCode2Icon className="mt-0.5 size-3.5 shrink-0" />
          <span>
            O motivo da rejeição já aparece no resumo e na linha do tempo. O retorno acima é o arquivo bruto
            recebido.
          </span>
        </div>
      )}
      {outbound && isNfse && (
        <div className="text-muted-foreground flex items-start gap-2 text-xs">
          <FileTextIcon className="mt-0.5 size-3.5 shrink-0" />
          <span>Em homologação (tpAmb=2) o DANFSe traz a marca “NFS-e SEM VALIDADE JURÍDICA”.</span>
        </div>
      )}
      {!outbound && (
        <div className="text-muted-foreground flex items-start gap-2 text-xs">
          <FileInputIcon className="mt-0.5 size-3.5 shrink-0" />
          <span>Baixe o XML original quando precisar conferir o arquivo recebido.</span>
        </div>
      )}
    </div>
  );
}
