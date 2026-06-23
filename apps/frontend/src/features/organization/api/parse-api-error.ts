type ApiErrorPayload = {
  message?: string;
  details?: string[];
  error?: string;
};

const VALIDATION_MESSAGES: Record<string, string> = {
  'organizationCompany.cnpj.cnpj': 'CNPJ inválido',
  'organizationCompany.razaoSocial.required': 'Razão social é obrigatória',
  'organizationCompany.razaoSocial.minLength': 'Razão social deve ter pelo menos 2 caracteres',
};

function mapValidationDetail(detail: string) {
  return VALIDATION_MESSAGES[detail] ?? detail;
}

function sanitizeErrorMessage(message: string) {
  const withoutMeta = message
    .split('Correlation ID:')[0]
    ?.split('Trace ID:')[0]
    ?.trim();

  if (!withoutMeta) {
    return message;
  }

  if (/not authorized/i.test(withoutMeta) || /AuthorizationFailed/i.test(withoutMeta)) {
    return 'Sem permissão para gravar certificados no Azure Key Vault. Conceda ao aplicativo permissões de certificados, chaves e segredos no vault.';
  }

  return withoutMeta;
}

function formatApiError(payload: ApiErrorPayload, fallback: string) {
  if (payload.details?.length) {
    const details = payload.details.map(mapValidationDetail).join(', ');
    if (details) {
      return details;
    }
  }

  if (payload.message === 'Internal server error') {
    return 'Erro interno do servidor. Tente novamente em instantes.';
  }

  if (payload.message === 'key_vault_error') {
    return 'Falha ao acessar o Azure Key Vault. Verifique as credenciais do backend.';
  }

  if (payload.message === 'integration_not_configured') {
    return 'Integração SAP não configurada para esta organização.';
  }

  if (payload.message && payload.message !== 'Validation failed') {
    return sanitizeErrorMessage(payload.message);
  }

  return fallback;
}

export async function parseApiError(response: Response, fallback: string): Promise<never> {
  const raw = await response.text();

  if (!raw) {
    throw new Error(
      response.status >= 500
        ? 'Erro interno do servidor. Tente novamente em instantes.'
        : fallback,
    );
  }

  try {
    const payload = JSON.parse(raw) as ApiErrorPayload;
    throw new Error(formatApiError(payload, fallback));
  } catch (error) {
    if (error instanceof Error && error.message !== fallback && !error.message.startsWith('Unexpected')) {
      throw error;
    }

    throw new Error(raw || fallback);
  }
}
