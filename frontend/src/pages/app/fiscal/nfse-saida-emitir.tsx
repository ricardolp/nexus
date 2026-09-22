import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ChevronLeftIcon, SparklesIcon, SendIcon } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import {
  ClassificationSelectCard,
  type ClassificationOption
} from '@/components/fiscal/classification-select-card';
import type { ApiCompanyNFSeService, ApiCustomer } from '@/lib/api-types';
import {
  createOutboundNFSe,
  getCustomer,
  getFiscalDocument,
  getLastNFSeClassification,
  listCompanies,
  listCompanyCNAEs,
  listCompanyNFSeServices,
  searchCatalogCNAE,
  searchCatalogLC116,
  searchCatalogNBS,
  suggestNFSeClassification,
  suggestNextRPS
} from '@/lib/endpoints';
import { useAuthStore } from '@/store/auth-store';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { resolveSubstituteActivityKey } from './nfse-cancel-subst-helpers';

const INDOP_OPTIONS: ClassificationOption[] = [
  {
    value: '030101',
    title: 'Outros serviços em operações com custo',
    subtitle: '030101'
  },
  {
    value: '100301',
    title: 'No endereço do cliente ou online (remotamente)',
    subtitle: '100301'
  },
  {
    value: '020101',
    title: 'No endereço do prestador',
    subtitle: '020101'
  },
  {
    value: '010101',
    title: 'Operação presencial',
    subtitle: '010101'
  }
];

/** Form initial values (editable — never used as silent gateway fallbacks). */
const INITIAL_PIS_COFINS_CST = '00';
const INITIAL_PIS_COFINS_RET = '0';

type ActivityChoice = {
  key: string;
  cnaeCode: string;
  cnaeDescription: string;
  isPrimary: boolean;
  activity?: ApiCompanyNFSeService;
};

type SourceBadge = 'Principal' | 'Favorito' | 'Sugerido' | 'IA' | undefined;

function newIdempotencyKey() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `nfse-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function offsetIso() {
  const offsetMin = -new Date().getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMin);
  const hh = String(Math.floor(abs / 60)).padStart(2, '0');
  const mm = String(abs % 60).padStart(2, '0');
  return `${sign}${hh}:${mm}`;
}

function formatCnaeCode(code: string) {
  const digits = code.replace(/\D/g, '');
  if (digits.length !== 7) return code;
  return `${digits.slice(0, 4)}-${digits.slice(4, 5)}/${digits.slice(5)}`;
}

const MAX_SUGGESTED_BADGES = 2;

/** Related catalog rows come pre-ranked (suggested first). Only the top N keep the "Sugerido" badge. */
function mapRelatedCatalogOptions(
  items: Array<{ code: string; description: string; suggested?: boolean; code_digits?: string }>,
  opts?: { includeDigitsKeywords?: boolean }
): ClassificationOption[] {
  let suggestedBadges = 0;
  return items.map((item) => {
    let badge: string | undefined;
    if (item.suggested && suggestedBadges < MAX_SUGGESTED_BADGES) {
      badge = 'Sugerido';
      suggestedBadges += 1;
    }
    return {
      value: item.code,
      title: item.description,
      subtitle: item.code,
      badge,
      badgeVariant: 'outline' as const,
      keywords: opts?.includeDigitsKeywords
        ? `${item.code} ${item.code_digits ?? ''}`
        : item.code
    };
  });
}

export default function NFSeSaidaEmitirPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const customerId = params.get('customerId');
  const anonymous = params.get('anonymous') === '1';
  const substituirDocumentId = params.get('substituir');
  const motivoSubstituicao = params.get('motivoSubstituicao') || '99';
  const justificativaSubstituicao = params.get('justificativaSubstituicao') || '';
  const companyIdParam = params.get('companyId');

  const token = useAuthStore((s) => s.token);
  const organizationId = useAuthStore((s) => s.organizationId);

  const companiesQuery = useQuery({
    queryKey: ['companies', organizationId],
    queryFn: () => listCompanies(token!, organizationId!),
    enabled: !!token && !!organizationId
  });
  const companies = useMemo(
    () => (companiesQuery.data?.items ?? []).filter((c) => c.status === 'active'),
    [companiesQuery.data?.items]
  );

  const customerQuery = useQuery({
    queryKey: ['customer', organizationId, customerId],
    queryFn: () => getCustomer(token!, organizationId!, customerId!),
    enabled: !!token && !!organizationId && !!customerId
  });
  const customer: ApiCustomer | undefined = customerQuery.data;

  const originalQuery = useQuery({
    queryKey: ['fiscal-document', organizationId, substituirDocumentId],
    queryFn: () => getFiscalDocument(token!, organizationId!, substituirDocumentId!),
    enabled: !!token && !!organizationId && !!substituirDocumentId
  });
  const originalDoc = originalQuery.data;

  const [companyId, setCompanyId] = useState(companyIdParam || '');
  const [activityKey, setActivityKey] = useState('');
  const [manualChoice, setManualChoice] = useState<ActivityChoice | null>(null);
  const [nbsCode, setNbsCode] = useState('');
  const [nbsDescription, setNbsDescription] = useState('');
  const [nbsBadge, setNbsBadge] = useState<SourceBadge>();
  const [serviceListItem, setServiceListItem] = useState('');
  const [serviceListDescription, setServiceListDescription] = useState('');
  const [lcBadge, setLcBadge] = useState<SourceBadge>();
  const [indOp, setIndOp] = useState('030101');
  const [valor, setValor] = useState('');
  const [issRetido, setIssRetido] = useState(false);
  const [aliquotaPct, setAliquotaPct] = useState('');
  const [discriminacao, setDiscriminacao] = useState('');
  const [aiRationale, setAiRationale] = useState('');
  const [serieRps, setSerieRps] = useState('1');
  const [numeroRps, setNumeroRps] = useState('');
  const [pisCofinsCst, setPisCofinsCst] = useState(INITIAL_PIS_COFINS_CST);
  const [pisCofinsRetencao, setPisCofinsRetencao] = useState(INITIAL_PIS_COFINS_RET);
  const [valorPis, setValorPis] = useState('');
  const [valorCofins, setValorCofins] = useState('');
  const [valorIr, setValorIr] = useState('');
  const [valorInss, setValorInss] = useState('');
  const [valorCsll, setValorCsll] = useState('');
  const [snTotTribPct, setSnTotTribPct] = useState('');
  const [totTribFed, setTotTribFed] = useState('');
  const [totTribEst, setTotTribEst] = useState('');
  const [totTribMun, setTotTribMun] = useState('');
  const [ibsCst, setIbsCst] = useState('');
  const [ibsClassTrib, setIbsClassTrib] = useState('');
  const [reviewOpen, setReviewOpen] = useState(false);
  const [sendEmailToCustomer, setSendEmailToCustomer] = useState(true);
  const [dataEmissao, setDataEmissao] = useState(() => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
  });

  const autoFillSeq = useRef(0);

  useEffect(() => {
    if (!companyId && companies.length === 1) setCompanyId(companies[0].id);
  }, [companies, companyId]);

  useEffect(() => {
    if (!originalDoc) return;
    if (originalDoc.organization_company_id) {
      setCompanyId(originalDoc.organization_company_id);
    }
    const svc = originalDoc.nfse?.service;
    if (svc?.amount != null && !valor) setValor(String(svc.amount));
    if (svc?.description && !discriminacao) setDiscriminacao(svc.description);
    if (svc?.nbs && !nbsCode) setNbsCode(svc.nbs);
    if (svc?.national_tax_code && !serviceListItem) setServiceListItem(svc.national_tax_code);
    if (svc?.iss_withheld != null) setIssRetido(!!svc.iss_withheld);
    if (svc?.iss_rate != null && svc.iss_rate > 0 && !aliquotaPct) {
      const pct = svc.iss_rate <= 1 ? svc.iss_rate * 100 : svc.iss_rate;
      setAliquotaPct(String(pct));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot hydrate from original NFS-e
  }, [originalDoc?.id]);

  const cnaesQuery = useQuery({
    queryKey: ['company-cnaes', organizationId, companyId],
    queryFn: () => listCompanyCNAEs(token!, organizationId!, companyId),
    enabled: !!token && !!organizationId && !!companyId
  });
  const companyCnaes = cnaesQuery.data?.items ?? [];
  const enabledCnaes = useMemo(
    () => companyCnaes.filter((c) => c.enabled !== false),
    [companyCnaes]
  );
  const disabledCnaeCodes = useMemo(
    () => new Set(companyCnaes.filter((c) => c.enabled === false).map((c) => c.cnae_code)),
    [companyCnaes]
  );

  const servicesQuery = useQuery({
    queryKey: ['company-nfse-services', organizationId, companyId],
    queryFn: () => listCompanyNFSeServices(token!, organizationId!, companyId),
    enabled: !!token && !!organizationId && !!companyId
  });
  const activities = useMemo(
    () =>
      (servicesQuery.data?.items ?? []).filter(
        (s) => s.status === 'active' && !disabledCnaeCodes.has(s.cnae_code)
      ),
    [servicesQuery.data?.items, disabledCnaeCodes]
  );
  const allowManualCnae = activities.length === 0;

  const rpsQuery = useQuery({
    queryKey: ['company-nfse-next-rps', organizationId, companyId],
    queryFn: () => suggestNextRPS(token!, organizationId!, companyId),
    enabled: !!token && !!organizationId && !!companyId
  });

  useEffect(() => {
    if (!rpsQuery.data) return;
    setSerieRps(rpsQuery.data.serie_rps || '1');
    setNumeroRps(rpsQuery.data.numero_rps || '1');
  }, [rpsQuery.data]);

  const activityChoices = useMemo<ActivityChoice[]>(() => {
    const byCnae = new Map(enabledCnaes.map((c) => [c.cnae_code, c]));
    const choices: ActivityChoice[] = [];
    const covered = new Set<string>();

    for (const activity of activities) {
      const cnae = byCnae.get(activity.cnae_code);
      const cnaeDescription =
        activity.service_description ||
        activity.cnae_description ||
        cnae?.cnae_description ||
        `CNAE ${activity.cnae_code}`;
      choices.push({
        key: `activity:${activity.id}`,
        cnaeCode: activity.cnae_code,
        cnaeDescription,
        isPrimary: !!cnae?.is_primary,
        activity
      });
      covered.add(activity.cnae_code);
    }

    for (const cnae of enabledCnaes) {
      if (covered.has(cnae.cnae_code)) continue;
      choices.push({
        key: `cnae:${cnae.cnae_code}`,
        cnaeCode: cnae.cnae_code,
        cnaeDescription: cnae.cnae_description || `CNAE ${cnae.cnae_code}`,
        isPrimary: cnae.is_primary
      });
    }

    return choices.sort((a, b) => {
      if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
      return a.cnaeCode.localeCompare(b.cnaeCode) || a.cnaeDescription.localeCompare(b.cnaeDescription);
    });
  }, [activities, enabledCnaes]);

  // Prefill CNAE/atividade from the original note once company activities load.
  useEffect(() => {
    if (!substituirDocumentId || !originalDoc) return;
    const key = resolveSubstituteActivityKey(originalDoc.nfse?.service?.cnae, activityChoices);
    if (!key) return;
    setActivityKey((cur) => (cur ? cur : key));
    if (key.startsWith('catalog:')) {
      const rawCnae = key.slice('catalog:'.length);
      setManualChoice((cur) =>
        cur?.key === key
          ? cur
          : {
              key,
              cnaeCode: rawCnae,
              cnaeDescription: `CNAE ${rawCnae}`,
              isPrimary: false
            }
      );
    }
  }, [substituirDocumentId, originalDoc, activityChoices]);

  useEffect(() => {
    if (substituirDocumentId) return;
    setActivityKey((cur) => {
      if (cur && activityChoices.some((c) => c.key === cur)) return cur;
      if (cur.startsWith('catalog:')) return cur;
      if (allowManualCnae) return '';
      if (!activityChoices.length) return '';
      const preferred = activityChoices.find((c) => c.isPrimary) ?? activityChoices[0];
      return preferred.key;
    });
  }, [activityChoices, allowManualCnae, substituirDocumentId]);

  const selectedChoice =
    activityChoices.find((c) => c.key === activityKey) ??
    (manualChoice?.key === activityKey ? manualChoice : undefined) ??
    (activityKey.startsWith('catalog:')
      ? {
          key: activityKey,
          cnaeCode: activityKey.slice('catalog:'.length),
          cnaeDescription: manualChoice?.cnaeDescription || `CNAE ${activityKey.slice('catalog:'.length)}`,
          isPrimary: false
        }
      : undefined);
  const selectedCompany = companies.find((c) => c.id === companyId);
  const cnaeCode = selectedChoice?.cnaeCode ?? '';

  // Related pool = catalog rows matching CNAE/NBS hints. UI caps "Sugerido" badges at 2;
  // the rest stay visible as related (no badge). Typing searches the full catalog.
  const lcCatalogQuery = useQuery({
    queryKey: ['catalog-lc116-emit', organizationId, cnaeCode, nbsCode],
    queryFn: () =>
      searchCatalogLC116(token!, organizationId!, {
        cnae: cnaeCode,
        nbs: nbsCode,
        suggestedOnly: true,
        limit: 80
      }),
    enabled: !!token && !!organizationId && !!cnaeCode
  });

  const nbsCatalogQuery = useQuery({
    queryKey: ['catalog-nbs-emit', organizationId, cnaeCode],
    queryFn: () =>
      searchCatalogNBS(token!, organizationId!, {
        cnae: cnaeCode,
        suggestedOnly: true,
        limit: 80
      }),
    enabled: !!token && !!organizationId && !!cnaeCode
  });

  useEffect(() => {
    // Substitution mode keeps hydrated fields from the original note; do not
    // wipe them with CNAE auto-defaults until the user picks another activity.
    if (substituirDocumentId) return;
    if (!selectedChoice || !token || !organizationId || !companyId) return;

    const seq = ++autoFillSeq.current;
    let cancelled = false;

    async function applyDefaults() {
      const activity = selectedChoice!.activity;
      const cnaeDesc = selectedChoice!.cnaeDescription;

      setServiceListItem('');
      setServiceListDescription('');
      setLcBadge(undefined);
      setNbsCode('');
      setNbsDescription('');
      setNbsBadge(undefined);
      setDiscriminacao(
        activity?.default_discrimination || activity?.service_description || cnaeDesc || ''
      );
      setAiRationale('');
      if (activity?.default_iss_aliquot != null) {
        setAliquotaPct(String(Number((activity.default_iss_aliquot * 100).toFixed(4))));
      }

      let nextLc = activity?.service_list_item?.trim() || '';
      let nextLcDesc = '';
      let nextLcBadge: SourceBadge = nextLc ? 'Favorito' : undefined;
      let nextNbs = activity?.nbs_code?.trim() || '';
      let nextNbsDesc = activity?.nbs_description?.trim() || '';
      let nextNbsBadge: SourceBadge = nextNbs ? 'Favorito' : undefined;

      if (!nextLc || !nextNbs) {
        try {
          const last = await getLastNFSeClassification(
            token!,
            organizationId!,
            companyId,
            selectedChoice!.cnaeCode
          );
          if (cancelled || seq !== autoFillSeq.current) return;
          if (last.found) {
            if (!nextLc && last.item_lista_servico) {
              nextLc = last.item_lista_servico;
              nextLcBadge = 'Favorito';
            }
            if (!nextNbs && last.codigo_nbs) {
              nextNbs = last.codigo_nbs;
              nextNbsDesc = last.nbs_description || '';
              nextNbsBadge = 'Favorito';
            }
          }
        } catch {
          // ignore — fall through to catalog suggestions
        }
      }

      if (!nextNbs) {
        try {
          const nbsRes = await searchCatalogNBS(token!, organizationId!, {
            cnae: selectedChoice!.cnaeCode,
            suggestedOnly: true,
            limit: 5
          });
          if (cancelled || seq !== autoFillSeq.current) return;
          if (nbsRes?.items?.[0]) {
            nextNbs = nbsRes.items[0].code;
            nextNbsDesc = nbsRes.items[0].description;
            nextNbsBadge = 'Sugerido';
          }
        } catch {
          // leave empty for manual selection
        }
      }

      if (!nextLc) {
        try {
          const lcRes = await searchCatalogLC116(token!, organizationId!, {
            cnae: selectedChoice!.cnaeCode,
            nbs: nextNbs,
            suggestedOnly: true,
            limit: 5
          });
          if (cancelled || seq !== autoFillSeq.current) return;
          if (lcRes?.items?.[0]) {
            nextLc = lcRes.items[0].code;
            nextLcDesc = lcRes.items[0].description;
            nextLcBadge = 'Sugerido';
          }
        } catch {
          // leave empty for manual selection
        }
      } else if (nextNbs) {
        try {
          const lcRes = await searchCatalogLC116(token!, organizationId!, {
            cnae: selectedChoice!.cnaeCode,
            nbs: nextNbs,
            suggestedOnly: true,
            limit: 20
          });
          if (cancelled || seq !== autoFillSeq.current) return;
          const match = lcRes.items.find((i) => i.code === nextLc);
          if (match) {
            nextLcDesc = match.description || nextLcDesc;
          } else if (lcRes.items[0]) {
            nextLc = lcRes.items[0].code;
            nextLcDesc = lcRes.items[0].description;
            nextLcBadge = 'Sugerido';
          }
        } catch {
          // keep current suggestion
        }
      }

      if (cancelled || seq !== autoFillSeq.current) return;

      if (nextLc && !nextLcDesc) {
        const hit = lcCatalogQuery.data?.items.find((i) => i.code === nextLc);
        nextLcDesc = hit?.description || '';
      }
      if (nextNbs && !nextNbsDesc) {
        const hit = nbsCatalogQuery.data?.items.find((i) => i.code === nextNbs);
        nextNbsDesc = hit?.description || '';
      }

      setServiceListItem(nextLc);
      setServiceListDescription(nextLcDesc);
      setLcBadge(nextLcBadge);
      setNbsCode(nextNbs);
      setNbsDescription(nextNbsDesc);
      setNbsBadge(nextNbsBadge);
    }

    void applyDefaults();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- catalogs refresh descriptions when loaded
  }, [selectedChoice?.key, companyId, token, organizationId, substituirDocumentId]);

  useEffect(() => {
    if (substituirDocumentId) return;
    if (!nbsCode || !lcCatalogQuery.data || lcCatalogQuery.isFetching) return;
    const items = lcCatalogQuery.data.items ?? [];
    if (items.length === 0) return;
    if (serviceListItem && items.some((i) => i.code === serviceListItem)) {
      if (!serviceListDescription) {
        const hit = items.find((i) => i.code === serviceListItem);
        if (hit) setServiceListDescription(hit.description);
      }
      return;
    }
    const first = items[0];
    setServiceListItem(first.code);
    setServiceListDescription(first.description);
    setLcBadge('Sugerido');
  }, [nbsCode, lcCatalogQuery.data, lcCatalogQuery.isFetching, serviceListItem, serviceListDescription, substituirDocumentId]);

  useEffect(() => {
    if (!nbsCode || nbsDescription) return;
    const hit = nbsCatalogQuery.data?.items.find((i) => i.code === nbsCode);
    if (hit) setNbsDescription(hit.description);
  }, [nbsCatalogQuery.data, nbsCode, nbsDescription]);

  const activityOptions = useMemo<ClassificationOption[]>(
    () =>
      activityChoices.map((c) => ({
        value: c.key,
        title: c.cnaeDescription,
        subtitle: formatCnaeCode(c.cnaeCode),
        badge: c.isPrimary ? 'Principal' : undefined,
        badgeVariant: 'default' as const,
        keywords: `${c.cnaeCode} ${c.activity?.service_description ?? ''}`
      })),
    [activityChoices]
  );

  const lcOptions = useMemo<ClassificationOption[]>(
    () => mapRelatedCatalogOptions(lcCatalogQuery.data?.items ?? []),
    [lcCatalogQuery.data?.items]
  );

  const nbsOptions = useMemo<ClassificationOption[]>(
    () =>
      mapRelatedCatalogOptions(nbsCatalogQuery.data?.items ?? [], {
        includeDigitsKeywords: true
      }),
    [nbsCatalogQuery.data?.items]
  );

  const selectedIndOp = INDOP_OPTIONS.find((o) => o.value === indOp) ?? INDOP_OPTIONS[0];

  const valorNum = Number(String(valor).replace(',', '.'));
  const aliquotaPctNum = Number(String(aliquotaPct).replace(',', '.'));
  const issAmount =
    Number.isFinite(valorNum) && Number.isFinite(aliquotaPctNum) && valorNum > 0 && aliquotaPctNum > 0
      ? (valorNum * aliquotaPctNum) / 100
      : 0;
  const parseMoney = (raw: string) => {
    const n = Number(String(raw).replace(',', '.'));
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };
  /** Allows 0 (Lei 12.741 / vTotTrib may be zero for a sphere). Empty → undefined. */
  const parseMoneyAllowZero = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return undefined;
    const n = Number(String(trimmed).replace(',', '.'));
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  };
  const valorPisNum = parseMoney(valorPis);
  const valorCofinsNum = parseMoney(valorCofins);
  const valorIrNum = parseMoney(valorIr);
  const valorInssNum = parseMoney(valorInss);
  const valorCsllNum = parseMoney(valorCsll);
  const snTotTribPctNum = Number(String(snTotTribPct).replace(',', '.'));
  const totTribFedNum = parseMoneyAllowZero(totTribFed);
  const totTribEstNum = parseMoneyAllowZero(totTribEst);
  const totTribMunNum = parseMoneyAllowZero(totTribMun);
  const taxRegime = selectedCompany?.tax_regime ?? '1';
  const isNaoOptante = taxRegime === '1';
  const isMei = taxRegime === '2';
  const isMeEpp = taxRegime === '3';
  const isSimplesOptante = isMei || isMeEpp;
  const locPrestacaoCode =
    selectedCompany?.ibge_municipality_code || customer?.municipality_code || '';

  const customerEmail = (() => {
    if (substituirDocumentId && originalDoc?.nfse?.recipient?.email) {
      return originalDoc.nfse.recipient.email.trim();
    }
    if (!anonymous && customer?.email) return customer.email.trim();
    return '';
  })();

  const withheldTotal =
    (issRetido ? issAmount : 0) +
    (valorPisNum ?? 0) +
    (valorCofinsNum ?? 0) +
    (valorIrNum ?? 0) +
    (valorInssNum ?? 0) +
    (valorCsllNum ?? 0);
  const netAmount = Math.max(0, (valorNum || 0) - withheldTotal);

  useEffect(() => {
    setSendEmailToCustomer(Boolean(customerEmail));
  }, [customerEmail]);

  function moneyBr(n: number) {
    return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function validateBeforeReview() {
    if (!selectedCompany) throw new Error('Selecione a empresa');
    if (!cnaeCode) throw new Error('Selecione a atividade da empresa (CNAE)');
    if (!nbsCode.trim()) throw new Error('Selecione o detalhamento do serviço (NBS)');
    if (!serviceListItem.trim()) throw new Error('Selecione o serviço prestado (código nacional)');
    if (!selectedCompany.ibge_municipality_code) {
      throw new Error('Preencha o município IBGE da empresa em Configurações → Empresas → Geral');
    }
    if (!selectedCompany.municipal_registration?.trim()) {
      throw new Error(
        'Preencha a inscrição municipal da empresa em Configurações → Empresas → Identificação fiscal'
      );
    }
    if (!serieRps.trim() || !numeroRps.trim()) throw new Error('Série e número do RPS são obrigatórios');
    if (!Number.isFinite(valorNum) || valorNum <= 0) throw new Error('Informe o valor dos serviços');
    if (!discriminacao.trim()) throw new Error('Descrição do serviço é obrigatória');
    if (!substituirDocumentId && !anonymous && !customer) throw new Error('Cliente não encontrado');
    if (substituirDocumentId && !originalDoc?.access_key) {
      throw new Error('A nota original ainda não tem chave de acesso para substituição');
    }
    if (
      substituirDocumentId &&
      motivoSubstituicao === '99' &&
      justificativaSubstituicao.trim().length < 15
    ) {
      throw new Error('Justificativa da substituição deve ter pelo menos 15 caracteres');
    }
    if (!pisCofinsCst.trim()) throw new Error('Informe o CST de PIS/COFINS');
    if (!pisCofinsRetencao.trim()) throw new Error('Informe o tipo de retenção de PIS/COFINS');
    if (isMeEpp) {
      if (!Number.isFinite(snTotTribPctNum) || snTotTribPctNum <= 0) {
        throw new Error(
          'Informe o percentual aproximado de tributos do Simples Nacional (pTotTribSN / Lei 12.741)'
        );
      }
    }
    if (isNaoOptante) {
      if (totTribFedNum == null || totTribEstNum == null || totTribMunNum == null) {
        throw new Error(
          'Informe os totais aproximados de tributos federal, estadual e municipal (Lei 12.741)'
        );
      }
    }
    const ibsCstDigits = ibsCst.replace(/\D/g, '');
    const ibsClassDigits = ibsClassTrib.replace(/\D/g, '');
    if ((ibsCstDigits && !ibsClassDigits) || (!ibsCstDigits && ibsClassDigits)) {
      throw new Error('IBS/CBS: preencha CST e classificação tributária juntos, ou deixe ambos vazios');
    }
  }

  const suggestMutation = useMutation({
    mutationFn: async () => {
      if (!token || !organizationId || !companyId) throw new Error('Sessão inválida');
      if (!cnaeCode) throw new Error('Selecione a atividade da empresa (CNAE)');
      return suggestNFSeClassification(token, organizationId, companyId, {
        cnae_code: cnaeCode,
        draft_discrimination: discriminacao,
        current_nbs: nbsCode || undefined,
        current_lc116: serviceListItem || undefined,
        customer_id: customerId || undefined
      });
    },
    onSuccess: (res) => {
      setNbsCode(res.codigo_nbs);
      setNbsDescription(res.nbs_description);
      setNbsBadge('IA');
      setServiceListItem(res.item_lista_servico);
      setServiceListDescription(res.lc116_description);
      setLcBadge('IA');
      setDiscriminacao(res.discriminacao);
      setAiRationale(res.rationale || '');
      toast.success('Sugestão aplicada — revise antes de emitir');
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Falha ao sugerir classificação')
  });

  const emitMutation = useMutation({
    mutationFn: async () => {
      if (!token || !organizationId) throw new Error('Sessão inválida');
      validateBeforeReview();

      const dataIso = `${dataEmissao}:00${offsetIso()}`;
      const aliquota =
        Number.isFinite(aliquotaPctNum) && aliquotaPctNum > 0 ? aliquotaPctNum / 100 : undefined;

      const recipient = originalDoc?.nfse?.recipient;
      const tomador: Record<string, unknown> =
        substituirDocumentId && recipient
          ? {
              ...(recipient.cnpj ? { cnpj: recipient.cnpj } : {}),
              ...(recipient.cpf ? { cpf: recipient.cpf } : {}),
              razao_social: recipient.legal_name || 'CONSUMIDOR NAO IDENTIFICADO',
              inscricao_municipal: recipient.im || undefined,
              telefone: recipient.address?.phone || undefined,
              endereco: recipient.address
                ? {
                    logradouro: recipient.address.street || undefined,
                    numero: recipient.address.number || undefined,
                    complemento: recipient.address.complement || undefined,
                    bairro: recipient.address.district || undefined,
                    codigo_municipio: recipient.address.city_code || undefined,
                    uf: recipient.address.uf || undefined,
                    cep: recipient.address.cep || undefined
                  }
                : undefined
            }
          : anonymous
            ? { razao_social: 'CONSUMIDOR NAO IDENTIFICADO' }
            : {
                ...(customer?.cnpj ? { cnpj: customer.cnpj } : {}),
                ...(customer?.cpf ? { cpf: customer.cpf } : {}),
                ...(customer?.nif ? { nif: customer.nif } : {}),
                razao_social: customer?.legal_name,
                inscricao_municipal: customer?.municipal_registration || undefined,
                telefone: customer?.phone || undefined,
                email: customer?.email || undefined,
                endereco: {
                  logradouro: customer?.street || undefined,
                  tipo_logradouro: customer?.street_type || undefined,
                  numero: customer?.number || undefined,
                  complemento: customer?.complement || undefined,
                  bairro: customer?.district || undefined,
                  codigo_municipio: customer?.municipality_code || undefined,
                  uf: customer?.uf || undefined,
                  cep: customer?.cep || undefined
                }
              };

      const payload: Record<string, unknown> = {
        data_emissao: dataIso,
        natureza_operacao: '1',
        serie_rps: serieRps.trim(),
        numero_rps: numeroRps.trim(),
        finalidade_emissao: '0',
        consumidor_final: '0',
        indicador_destinatario: '0',
        optante_simples_nacional: isSimplesOptante,
        op_simp_nac: selectedCompany!.tax_regime || '1',
        regime_especial_tributacao: selectedCompany!.special_tax_regime || '0',
        regime_apuracao_sn: isSimplesOptante ? '1' : undefined,
        ...(substituirDocumentId && originalDoc?.access_key
          ? {
              chave_nfse_substituida: originalDoc.access_key,
              numero_nfse_substituido: originalDoc.number || undefined,
              motivo_substituicao: motivoSubstituicao,
              justificativa_substituicao: justificativaSubstituicao || undefined
            }
          : {}),
        prestador: {
          cnpj: selectedCompany!.cnpj,
          inscricao_municipal: selectedCompany!.municipal_registration || undefined,
          codigo_municipio: selectedCompany!.ibge_municipality_code
        },
        tomador,
        servico: {
          valor_servicos: valorNum,
          base_calculo: valorNum,
          iss_retido: issRetido,
          aliquota,
          item_lista_servico: serviceListItem.trim(),
          codigo_cnae: cnaeCode,
          codigo_nbs: nbsCode.trim(),
          discriminacao: discriminacao.trim(),
          // Prestação defaults to the company's municipality when not overridden.
          codigo_municipio: locPrestacaoCode,
          codigo_indicador_operacao: indOp,
          situacao_tributaria_pis_cofins: pisCofinsCst.trim(),
          tipo_retencao_pis_cofins: pisCofinsRetencao.trim(),
          ...(isMeEpp ? { percentual_total_tributos: snTotTribPctNum } : {}),
          ...(isNaoOptante
            ? {
                total_tributos: {
                  federal: totTribFedNum!,
                  estadual: totTribEstNum!,
                  municipal: totTribMunNum!
                }
              }
            : {}),
          ...(valorPisNum != null ? { valor_pis: valorPisNum } : {}),
          ...(valorCofinsNum != null ? { valor_cofins: valorCofinsNum } : {}),
          ...(isNaoOptante && valorIrNum != null ? { valor_ir: valorIrNum } : {}),
          ...(isNaoOptante && valorInssNum != null ? { valor_inss: valorInssNum } : {}),
          ...(isNaoOptante && valorCsllNum != null ? { valor_csll: valorCsllNum } : {}),
          ...(ibsCst.replace(/\D/g, '') && ibsClassTrib.replace(/\D/g, '')
            ? {
                ibs_cbs_situacao_tributaria: ibsCst.replace(/\D/g, ''),
                ibs_cbs_classificacao_tributaria: ibsClassTrib.replace(/\D/g, '')
              }
            : {})
        },
        enviar_email_tomador: sendEmailToCustomer && Boolean(customerEmail)
      };

      return createOutboundNFSe(token, organizationId, companyId, payload, newIdempotencyKey());
    },
    onSuccess: (result) => {
      toast.success(result.replayed ? 'NFS-e já havia sido enviada' : 'NFS-e enfileirada');
      navigate(`/app/nfse/saida/${result.document_id}`);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Falha ao emitir')
  });

  function openReview() {
    try {
      validateBeforeReview();
      setReviewOpen(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Revise os dados da nota');
    }
  }

  function resetClassification() {
    setActivityKey('');
    setManualChoice(null);
    setNbsCode('');
    setNbsDescription('');
    setNbsBadge(undefined);
    setServiceListItem('');
    setServiceListDescription('');
    setLcBadge(undefined);
    setDiscriminacao('');
    setAiRationale('');
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      {reviewOpen ? (
        <>
          <Button
            variant="ghost"
            size="sm"
            className="w-fit"
            type="button"
            onClick={() => setReviewOpen(false)}
          >
            <ChevronLeftIcon />
            Emitir nota
          </Button>

          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight">Revisão da nota</h1>
            <p className="text-muted-foreground text-sm">
              Confira os dados antes de enviar ao Portal Nacional.
            </p>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Dados do cliente</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div>
                <p className="font-medium">
                  {substituirDocumentId && originalDoc?.nfse?.recipient
                    ? originalDoc.nfse.recipient.legal_name || 'Tomador da nota original'
                    : anonymous
                      ? 'Cliente não informado'
                      : customer?.legal_name}
                </p>
                {substituirDocumentId && originalDoc?.nfse?.recipient ? (
                  <p className="text-muted-foreground text-sm">
                    {originalDoc.nfse.recipient.cnpj || originalDoc.nfse.recipient.cpf}
                  </p>
                ) : !anonymous && customer ? (
                  <p className="text-muted-foreground text-sm">
                    {customer.cnpj || customer.cpf || customer.nif}
                  </p>
                ) : null}
              </div>
              <label
                className={`flex items-start gap-3 rounded-lg border p-3 text-sm ${
                  customerEmail ? 'cursor-pointer' : 'opacity-60'
                }`}
              >
                <Checkbox
                  className="mt-0.5"
                  checked={sendEmailToCustomer && Boolean(customerEmail)}
                  disabled={!customerEmail}
                  onCheckedChange={(v) => setSendEmailToCustomer(v === true)}
                />
                <span>
                  {customerEmail ? (
                    <>
                      Enviar uma cópia da nota para o cliente{' '}
                      <span className="font-medium uppercase">{customerEmail}</span>
                    </>
                  ) : (
                    <>
                      Cliente sem e-mail cadastrado — a nota não será enviada automaticamente ao
                      tomador.
                    </>
                  )}
                  <span className="text-muted-foreground mt-1 block text-xs">
                    Você receberá automaticamente uma cópia se o template de e-mail da empresa
                    estiver ativo com destinatários manuais.
                  </span>
                </span>
              </label>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Valores da nota fiscal</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              <div className="flex justify-between gap-4">
                <span>Valor do serviço</span>
                <span className="tabular-nums">{moneyBr(valorNum || 0)}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span>Base de cálculo</span>
                <span className="tabular-nums">{moneyBr(valorNum || 0)}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Impostos e retenções</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              <div className="flex justify-between gap-4">
                <span>
                  ISS ({issRetido ? 'retido' : 'não retido'}
                  {Number.isFinite(aliquotaPctNum) && aliquotaPctNum > 0
                    ? ` ${aliquotaPctNum.toLocaleString('pt-BR')}%`
                    : ''}
                  )
                </span>
                <span className="tabular-nums">{moneyBr(issAmount)}</span>
              </div>
              {isNaoOptante && valorPisNum != null ? (
                <div className="flex justify-between gap-4">
                  <span>PIS</span>
                  <span className="tabular-nums">{moneyBr(valorPisNum)}</span>
                </div>
              ) : null}
              {isNaoOptante && valorCofinsNum != null ? (
                <div className="flex justify-between gap-4">
                  <span>COFINS</span>
                  <span className="tabular-nums">{moneyBr(valorCofinsNum)}</span>
                </div>
              ) : null}
              {isNaoOptante && valorIrNum != null ? (
                <div className="flex justify-between gap-4">
                  <span>IRRF</span>
                  <span className="tabular-nums">{moneyBr(valorIrNum)}</span>
                </div>
              ) : null}
              {isNaoOptante && valorInssNum != null ? (
                <div className="flex justify-between gap-4">
                  <span>INSS</span>
                  <span className="tabular-nums">{moneyBr(valorInssNum)}</span>
                </div>
              ) : null}
              {isNaoOptante && valorCsllNum != null ? (
                <div className="flex justify-between gap-4">
                  <span>CSLL</span>
                  <span className="tabular-nums">{moneyBr(valorCsllNum)}</span>
                </div>
              ) : null}
              {isMeEpp && Number.isFinite(snTotTribPctNum) && snTotTribPctNum > 0 ? (
                <p className="text-muted-foreground text-xs">
                  Total aproximado de tributos do Simples Nacional (pTotTribSN):{' '}
                  {snTotTribPctNum.toLocaleString('pt-BR')}%
                </p>
              ) : null}
              {isMei ? (
                <p className="text-muted-foreground text-xs">
                  MEI: transparência tributária via indTotTrib = 0 (sem valores estimados).
                </p>
              ) : null}
              {isNaoOptante &&
              totTribFedNum != null &&
              totTribEstNum != null &&
              totTribMunNum != null ? (
                <div className="text-muted-foreground space-y-1 text-xs">
                  <p>Totais aproximados (Lei 12.741):</p>
                  <p>Federal {moneyBr(totTribFedNum)} · Estadual {moneyBr(totTribEstNum)} · Municipal{' '}
                    {moneyBr(totTribMunNum)}</p>
                </div>
              ) : null}
              {ibsCst.replace(/\D/g, '') ? (
                <p className="text-muted-foreground text-xs">
                  IBS/CBS: CST {ibsCst.replace(/\D/g, '')} · cClassTrib{' '}
                  {ibsClassTrib.replace(/\D/g, '')}
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Valor líquido da nota</CardTitle>
              <CardDescription>
                O valor líquido da nota é a base de cálculo diminuída das retenções.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              <div className="flex justify-between gap-4">
                <span>Base de cálculo</span>
                <span className="tabular-nums">{moneyBr(valorNum || 0)}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span>Total de retenções</span>
                <span className="tabular-nums">- {moneyBr(withheldTotal)}</span>
              </div>
              <div className="flex justify-between gap-4 border-t pt-2 font-semibold">
                <span>Valor líquido da nota</span>
                <span className="tabular-nums">{moneyBr(netAmount)}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Informações do serviço</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              <p>
                <span className="text-muted-foreground">CNAE:</span> {formatCnaeCode(cnaeCode)} —{' '}
                {selectedChoice?.cnaeDescription}
              </p>
              <p>
                <span className="text-muted-foreground">Código nacional:</span> {serviceListItem} —{' '}
                {serviceListDescription || '—'}
              </p>
              <p>
                <span className="text-muted-foreground">NBS:</span> {nbsCode} — {nbsDescription || '—'}
              </p>
              <p>
                <span className="text-muted-foreground">IndOp:</span> {selectedIndOp.subtitle} —{' '}
                {selectedIndOp.title}
              </p>
              <div className="mt-2">
                <p className="text-muted-foreground text-xs uppercase">Descrição do serviço</p>
                <p className="mt-1 whitespace-pre-wrap">{discriminacao}</p>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-2 pb-8">
            <Button type="button" variant="outline" onClick={() => setReviewOpen(false)}>
              Voltar
            </Button>
            <Button
              type="button"
              disabled={emitMutation.isPending}
              onClick={() => emitMutation.mutate()}
            >
              <SendIcon />
              {emitMutation.isPending ? 'Emitindo…' : 'Emitir nota'}
            </Button>
          </div>
        </>
      ) : (
        <>
      <Button variant="ghost" size="sm" className="w-fit" asChild>
        <Link to="/app/nfse/saida/nova">
          <ChevronLeftIcon />
          Voltar aos clientes
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>{substituirDocumentId ? 'Corrigir nota (substituição)' : 'Emitir nota'}</CardTitle>
          <CardDescription>
            {substituirDocumentId
              ? 'Corrija só o que mudou — os dados vêm da nota original. A SEFIN cancela a anterior automaticamente (evento 105102). Não é Carta de Correção.'
              : 'Escolha a atividade da empresa; NBS e o código nacional do serviço (LC 116) são sugeridos a partir do CNAE e da correlação oficial com o NBS. Série e número do RPS vêm da última nota emitida.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {substituirDocumentId ? (
            <section className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
              <p className="font-medium">Substituição da NFS-e {originalDoc?.number || originalDoc?.access_key || '…'}</p>
              <p className="text-muted-foreground mt-1">
                Motivo {motivoSubstituicao}
                {justificativaSubstituicao ? ` · ${justificativaSubstituicao}` : ''}
              </p>
            </section>
          ) : null}
          <section className="rounded-lg border p-4">
            <p className="text-muted-foreground mb-1 text-xs uppercase">Tomador</p>
            {substituirDocumentId && originalDoc?.nfse?.recipient ? (
              <>
                <p className="font-medium">
                  {originalDoc.nfse.recipient.legal_name || 'Tomador da nota original'}
                </p>
                <p className="text-muted-foreground text-sm">
                  {originalDoc.nfse.recipient.cnpj ||
                    originalDoc.nfse.recipient.cpf ||
                    'Documento do tomador original'}
                </p>
              </>
            ) : anonymous ? (
              <p className="font-medium">Cliente não informado</p>
            ) : customer ? (
              <>
                <p className="font-medium">{customer.legal_name}</p>
                <p className="text-muted-foreground text-sm">
                  {customer.cnpj || customer.cpf || customer.nif}
                  {customer.email ? ` · ${customer.email}` : ''}
                </p>
              </>
            ) : (
              <p className="text-muted-foreground text-sm">Carregando cliente…</p>
            )}
          </section>

          <div className="grid gap-4">
            <div>
              <Label>Empresa</Label>
              <Select
                value={companyId}
                onValueChange={(v) => {
                  setCompanyId(v);
                  resetClassification();
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecione o CNPJ prestador" />
                </SelectTrigger>
                <SelectContent>
                  {companies.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.legal_name} ({c.cnpj})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <ClassificationSelectCard
              label="Atividade da empresa (CNAE)"
              required
              tooltip="CNAEs habilitados da empresa. Sem atividade cadastrada, busque o código no catálogo oficial."
              value={activityKey}
              title={selectedChoice?.cnaeDescription}
              subtitle={selectedChoice ? formatCnaeCode(selectedChoice.cnaeCode) : undefined}
              badge={selectedChoice?.isPrimary ? 'Principal' : undefined}
              badgeVariant="default"
              placeholder={
                companyId
                  ? allowManualCnae
                    ? 'Busque o CNAE no catálogo'
                    : 'Selecione a atividade'
                  : 'Escolha a empresa primeiro'
              }
              disabled={!companyId}
              options={activityOptions}
              searchPlaceholder="Buscar CNAE ou descrição…"
              emptyText={
                allowManualCnae ? 'Digite para buscar no catálogo oficial' : 'Nenhuma atividade encontrada'
              }
              helpText={
                allowManualCnae
                  ? 'Nenhuma atividade cadastrada — informe o CNAE na mão ou escolha um código visível da empresa.'
                  : undefined
              }
              remoteSearch={
                allowManualCnae && token && organizationId
                  ? {
                      enabled: true,
                      queryKey: ['catalog-cnae-emit', organizationId, companyId],
                      queryFn: async (q) => {
                        const res = await searchCatalogCNAE(token, organizationId, q, 40);
                        const localCodes = new Set(activityChoices.map((c) => c.cnaeCode));
                        return res.items
                          .filter((item) => !localCodes.has(item.code))
                          .map((item) => ({
                            value: `catalog:${item.code}`,
                            title: item.description,
                            subtitle: formatCnaeCode(item.code),
                            keywords: item.code
                          }));
                      }
                    }
                  : undefined
              }
              onChange={(opt) => {
                setActivityKey(opt.value);
                if (opt.value.startsWith('catalog:')) {
                  setManualChoice({
                    key: opt.value,
                    cnaeCode: opt.value.slice('catalog:'.length),
                    cnaeDescription: opt.title,
                    isPrimary: false
                  });
                } else {
                  setManualChoice(null);
                }
              }}
            />

            <ClassificationSelectCard
              label="Detalhamento do serviço (NBS)"
              required
              tooltip="Nomenclatura Brasileira de Serviços vinculada ao CNAE da atividade. Usado na DPS nacional; alterar não muda a alíquota de ISS."
              helpText="Até 2 códigos com selo Sugerido; os demais são relacionados ao CNAE. Digite para buscar no catálogo completo. Alterar não impacta nos impostos."
              value={nbsCode}
              title={nbsDescription || (nbsCode ? nbsCode : undefined)}
              subtitle={nbsCode || undefined}
              badge={nbsBadge}
              badgeVariant={nbsBadge === 'Favorito' || nbsBadge === 'IA' ? 'default' : 'outline'}
              placeholder={cnaeCode ? 'Selecione o NBS' : 'Escolha a atividade primeiro'}
              disabled={!cnaeCode}
              options={nbsOptions}
              initialVisibleCount={8}
              expandLabel={(hidden) =>
                hidden > 0 ? `Ver todos os relacionados (${nbsOptions.length})` : undefined
              }
              searchPlaceholder="Buscar no catálogo completo…"
              emptyText={
                nbsCatalogQuery.isLoading
                  ? 'Carregando…'
                  : 'Nenhum NBS relacionado a este CNAE — busque pelo código ou descrição'
              }
              remoteSearch={
                token && organizationId && cnaeCode
                  ? {
                      enabled: true,
                      queryKey: ['catalog-nbs-emit-search', organizationId, cnaeCode],
                      queryFn: async (q) => {
                        if (!q.trim()) return [];
                        const res = await searchCatalogNBS(token, organizationId, {
                          q,
                          cnae: cnaeCode,
                          suggestedOnly: false,
                          limit: 40
                        });
                        return mapRelatedCatalogOptions(res.items, { includeDigitsKeywords: true });
                      }
                    }
                  : undefined
              }
              onChange={(opt) => {
                setNbsCode(opt.value);
                setNbsDescription(opt.title);
                setNbsBadge(undefined);
              }}
            />

            <ClassificationSelectCard
              label="Serviço prestado (código nacional)"
              required
              tooltip="Item da lista de serviços da LC 116 / código de tributação nacional, correlacionado ao NBS (Anexo VIII) e ao CNAE. Alterar não muda a alíquota de ISS."
              helpText="Até 2 códigos com selo Sugerido; os demais são relacionados ao NBS/CNAE. Digite para buscar no catálogo completo. Alterar não impacta nos impostos."
              value={serviceListItem}
              title={serviceListDescription || (serviceListItem ? serviceListItem : undefined)}
              subtitle={serviceListItem || undefined}
              badge={lcBadge}
              badgeVariant={lcBadge === 'Favorito' || lcBadge === 'IA' ? 'default' : 'outline'}
              placeholder={
                nbsCode ? 'Selecione o serviço' : cnaeCode ? 'Selecione o NBS primeiro' : 'Escolha a atividade primeiro'
              }
              disabled={!cnaeCode}
              options={lcOptions}
              initialVisibleCount={8}
              expandLabel={(hidden) =>
                hidden > 0 ? `Ver todos os relacionados (${lcOptions.length})` : undefined
              }
              searchPlaceholder="Buscar no catálogo completo…"
              emptyText={
                lcCatalogQuery.isLoading
                  ? 'Carregando…'
                  : 'Nenhum serviço relacionado ao NBS/CNAE — busque pelo código'
              }
              remoteSearch={
                token && organizationId && cnaeCode
                  ? {
                      enabled: true,
                      queryKey: ['catalog-lc116-emit-search', organizationId, cnaeCode, nbsCode],
                      queryFn: async (q) => {
                        if (!q.trim()) return [];
                        const res = await searchCatalogLC116(token, organizationId, {
                          q,
                          cnae: cnaeCode,
                          nbs: nbsCode,
                          suggestedOnly: false,
                          limit: 40
                        });
                        return mapRelatedCatalogOptions(res.items);
                      }
                    }
                  : undefined
              }
              onChange={(opt) => {
                setServiceListItem(opt.value);
                setServiceListDescription(opt.title);
                setLcBadge(undefined);
              }}
            />

            <ClassificationSelectCard
              label="Onde o serviço foi prestado"
              required
              tooltip="Indicador de operação (IndOp) informado na DPS. Não altera o cálculo do ISS nesta tela."
              helpText="Alterar não impacta nos impostos"
              value={indOp}
              title={selectedIndOp.title}
              subtitle={selectedIndOp.subtitle}
              options={INDOP_OPTIONS}
              searchable={false}
              onChange={(opt) => setIndOp(opt.value)}
            />

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <Label>Valor (R$)</Label>
                <Input value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" />
              </div>
              <div>
                <Label>Alíquota ISS (%)</Label>
                <Input
                  value={aliquotaPct}
                  onChange={(e) => setAliquotaPct(e.target.value)}
                  placeholder="0,00"
                />
              </div>
              <label className="flex items-center gap-2 self-end text-sm">
                <Checkbox checked={issRetido} onCheckedChange={(v) => setIssRetido(v === true)} />
                ISS retido
              </label>
            </div>

            <div className="space-y-3 rounded-lg border p-4">
              <div>
                <p className="text-sm font-medium">Transparência tributária (Lei 12.741)</p>
                <p className="text-muted-foreground text-xs">
                  O layout nacional exige um membro de totTrib conforme o regime da empresa.
                </p>
              </div>
              {isMeEpp ? (
                <div className="max-w-xs">
                  <Label>Percentual aproximado do Simples (pTotTribSN) %</Label>
                  <Input
                    value={snTotTribPct}
                    onChange={(e) => setSnTotTribPct(e.target.value)}
                    placeholder="0,00"
                  />
                </div>
              ) : null}
              {isMei ? (
                <p className="text-muted-foreground text-sm">
                  Regime MEI: a DPS enviará indTotTrib = 0 (sem percentual ou valores estimados).
                </p>
              ) : null}
              {isNaoOptante ? (
                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <Label>Total federal (R$)</Label>
                    <Input
                      value={totTribFed}
                      onChange={(e) => setTotTribFed(e.target.value)}
                      placeholder="0,00"
                    />
                  </div>
                  <div>
                    <Label>Total estadual (R$)</Label>
                    <Input
                      value={totTribEst}
                      onChange={(e) => setTotTribEst(e.target.value)}
                      placeholder="0,00"
                    />
                  </div>
                  <div>
                    <Label>Total municipal (R$)</Label>
                    <Input
                      value={totTribMun}
                      onChange={(e) => setTotTribMun(e.target.value)}
                      placeholder="0,00"
                    />
                  </div>
                </div>
              ) : null}
            </div>

            <div className="space-y-3 rounded-lg border p-4">
              <div>
                <p className="text-sm font-medium">PIS/COFINS</p>
                <p className="text-muted-foreground text-xs">
                  CST e retenção são obrigatórios na DPS. Valores são opcionais.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>PIS/COFINS — CST</Label>
                  <Input
                    value={pisCofinsCst}
                    onChange={(e) => setPisCofinsCst(e.target.value.replace(/\D/g, '').slice(0, 2))}
                    placeholder="00"
                  />
                </div>
                <div>
                  <Label>PIS/COFINS — retenção</Label>
                  <Select value={pisCofinsRetencao} onValueChange={setPisCofinsRetencao}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">Não retido</SelectItem>
                      <SelectItem value="1">Retido</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Valor PIS (R$)</Label>
                  <Input value={valorPis} onChange={(e) => setValorPis(e.target.value)} placeholder="0,00" />
                </div>
                <div>
                  <Label>Valor COFINS (R$)</Label>
                  <Input
                    value={valorCofins}
                    onChange={(e) => setValorCofins(e.target.value)}
                    placeholder="0,00"
                  />
                </div>
              </div>
            </div>

            {isNaoOptante ? (
              <div className="space-y-3 rounded-lg border p-4">
                <div>
                  <p className="text-sm font-medium">Outras retenções federais (opcional)</p>
                  <p className="text-muted-foreground text-xs">
                    Preencha apenas se houver retenção nesta nota.
                  </p>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <Label>IRRF (R$)</Label>
                    <Input value={valorIr} onChange={(e) => setValorIr(e.target.value)} placeholder="0,00" />
                  </div>
                  <div>
                    <Label>INSS (R$)</Label>
                    <Input value={valorInss} onChange={(e) => setValorInss(e.target.value)} placeholder="0,00" />
                  </div>
                  <div>
                    <Label>CSLL (R$)</Label>
                    <Input value={valorCsll} onChange={(e) => setValorCsll(e.target.value)} placeholder="0,00" />
                  </div>
                </div>
              </div>
            ) : null}

            <div className="space-y-3 rounded-lg border p-4">
              <div>
                <p className="text-sm font-medium">IBS/CBS (opcional)</p>
                <p className="text-muted-foreground text-xs">
                  Preencha só se for destacar classificação na DPS. Em branco, o grupo IBSCBS não é
                  enviado (válido enquanto a obrigatoriedade não se aplicar).
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>CST IBS/CBS</Label>
                  <Input
                    value={ibsCst}
                    onChange={(e) => setIbsCst(e.target.value.replace(/\D/g, '').slice(0, 3))}
                    placeholder="000"
                  />
                </div>
                <div>
                  <Label>Classificação tributária (cClassTrib)</Label>
                  <Input
                    value={ibsClassTrib}
                    onChange={(e) => setIbsClassTrib(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000001"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label>Descrição do serviço</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!cnaeCode || suggestMutation.isPending}
                  onClick={() => suggestMutation.mutate()}
                >
                  <SparklesIcon />
                  {suggestMutation.isPending ? 'Sugerindo…' : 'Sugerir com IA'}
                </Button>
              </div>
              <Textarea
                rows={4}
                value={discriminacao}
                onChange={(e) => {
                  setDiscriminacao(e.target.value);
                  if (aiRationale) setAiRationale('');
                }}
                placeholder={
                  selectedChoice?.cnaeDescription || 'Descreva o serviço prestado'
                }
              />
              {aiRationale ? (
                <p className="text-muted-foreground text-xs">{aiRationale}</p>
              ) : (
                <p className="text-muted-foreground text-xs">
                  A IA escolhe NBS e LC 116 entre os candidatos do catálogo e melhora a
                  discriminação. Revise antes de emitir.
                </p>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <Label>Série RPS</Label>
                <Input value={serieRps} readOnly className="bg-muted/40" />
              </div>
              <div>
                <Label>Número RPS</Label>
                <Input value={numeroRps} readOnly className="bg-muted/40" />
              </div>
              <div>
                <Label>Emissão</Label>
                <Input
                  type="datetime-local"
                  value={dataEmissao}
                  onChange={(e) => setDataEmissao(e.target.value)}
                />
              </div>
            </div>
            {rpsQuery.data?.from_last ? (
              <p className="text-muted-foreground -mt-2 text-xs">
                Próximo RPS sugerido a partir da última NFS-e emitida nesta empresa.
              </p>
            ) : companyId && !rpsQuery.isLoading ? (
              <p className="text-muted-foreground -mt-2 text-xs">
                Primeira emissão desta empresa — RPS inicia em série 1 / número 1.
              </p>
            ) : null}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" asChild>
              <Link to="/app/nfse/saida/nova">Cancelar</Link>
            </Button>
            <Button type="button" onClick={openReview}>
              Continuar
            </Button>
          </div>
        </CardContent>
      </Card>
        </>
      )}
    </div>
  );
}
