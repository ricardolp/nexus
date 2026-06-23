export interface CertificateUploadInput {
  buffer: Buffer;
  password: string;
  name?: string;
  description?: string;
  status?: 'active' | 'inactive';
}

export function parseCertificateUploadFields(body: {
  password?: string;
  name?: string;
  description?: string;
  status?: string;
}): Omit<CertificateUploadInput, 'buffer'> {
  const status = normalizeStatus(body.status);

  return {
    password: body.password ?? '',
    name: body.name,
    description: body.description,
    status: status ?? 'inactive',
  };
}

function normalizeStatus(
  value: string | undefined,
): 'active' | 'inactive' | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.toLowerCase().trim();

  if (normalized === 'active' || normalized === 'ativo') {
    return 'active';
  }

  if (normalized === 'inactive' || normalized === 'inativo') {
    return 'inactive';
  }

  return undefined;
}
