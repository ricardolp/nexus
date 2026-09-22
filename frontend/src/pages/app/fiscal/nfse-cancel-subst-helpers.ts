/** Pure helpers for NFS-e substitute UX / cancel timeline smoke checks. */

export function resolveSubstituteActivityKey(
  cnae: string | undefined | null,
  choices: Array<{ key: string; cnaeCode: string }>
): string | null {
  const raw = String(cnae || '').replace(/\D/g, '');
  if (!raw) return null;
  const match = choices.find((c) => c.cnaeCode.replace(/\D/g, '') === raw);
  if (match) return match.key;
  return `catalog:${raw}`;
}

export function cancelledEventDescription(meta: {
  protocol?: string;
  cstat?: string;
  x_motivo?: string;
}): string {
  const bits: string[] = [];
  if (meta.cstat && meta.x_motivo) bits.push(`${meta.cstat} — ${meta.x_motivo}`);
  else if (meta.x_motivo) bits.push(meta.x_motivo);
  else if (meta.cstat) bits.push(`Código ${meta.cstat}`);
  if (meta.protocol) bits.push(`Protocolo ${meta.protocol}`);
  return bits.join(' · ');
}
