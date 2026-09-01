import { Link } from 'react-router-dom';

import type { TicketFiscalRef } from '@/modules/support/data';

const ALLOWED = new Set(['B', 'I', 'U', 'STRONG', 'EM', 'P', 'BR', 'UL', 'OL', 'LI', 'A', 'DIV', 'SPAN']);

function fiscalPath(ref: TicketFiscalRef) {
  return ref.documentType === 'nfse' ? `/app/nfse/${ref.documentId}` : `/app/nfe/${ref.documentId}`;
}

export function sanitizeTicketHtml(html: string) {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const walk = (node: Node) => {
    const children = Array.from(node.childNodes);
    for (const child of children) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as HTMLElement;
        if (!ALLOWED.has(el.tagName)) {
          const text = parsed.createTextNode(el.textContent ?? '');
          el.replaceWith(text);
          continue;
        }
        if (el.tagName === 'A') {
          const href = el.getAttribute('href') ?? '';
          if (!href.startsWith('/app/')) el.removeAttribute('href');
        } else {
          for (const attr of Array.from(el.attributes)) {
            if (attr.name !== 'data-fiscal-id' && attr.name !== 'data-fiscal-number' && attr.name !== 'data-fiscal-type') {
              el.removeAttribute(attr.name);
            }
          }
        }
        walk(el);
      }
    }
  };
  walk(parsed.body);
  return parsed.body.innerHTML;
}

export function ticketPlainText(html: string) {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  return (parsed.body.textContent ?? '').replace(/\s+/g, ' ').trim();
}

export function TicketHtml({ html, refs }: { html: string; refs: TicketFiscalRef[] }) {
  const byNumber = new Map(refs.map((ref) => [ref.number, ref]));
  const parsed = new DOMParser().parseFromString(sanitizeTicketHtml(html), 'text/html');
  const nodes: React.ReactNode[] = [];

  const render = (node: Node, key: string): React.ReactNode => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? '';
      const parts = text.split(/(#\d+)/g);
      return parts.map((part, i) => {
        const match = part.match(/^#(\d+)$/);
        if (!match) return <span key={`${key}-t-${i}`}>{part}</span>;
        const ref = byNumber.get(match[1]);
        if (!ref || !ref.documentId) return <span key={`${key}-t-${i}`}>{part}</span>;
        return (
          <Link
            key={`${key}-t-${i}`}
            to={fiscalPath(ref)}
            className="text-primary font-medium underline underline-offset-2"
          >
            #{ref.number}
          </Link>
        );
      });
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return null;
    const el = node as HTMLElement;
    const children = Array.from(el.childNodes).map((child, i) => render(child, `${key}-${i}`));
    if (el.tagName === 'A') {
      const number = el.getAttribute('data-fiscal-number') ?? el.textContent?.replace('#', '') ?? '';
      const ref = byNumber.get(number);
      if (ref && ref.documentId) {
        return (
          <Link
            key={key}
            to={fiscalPath(ref)}
            className="text-primary font-medium underline underline-offset-2"
          >
            #{ref.number}
          </Link>
        );
      }
    }
    if (el.tagName === 'BR') return <br key={key} />;
    if (el.tagName === 'LI') return <li key={key}>{children}</li>;
    if (el.tagName === 'UL') return <ul key={key} className="list-disc pl-5">{children}</ul>;
    if (el.tagName === 'OL') return <ol key={key} className="list-decimal pl-5">{children}</ol>;
    if (el.tagName === 'P' || el.tagName === 'DIV') return <p key={key}>{children}</p>;
    if (el.tagName === 'STRONG' || el.tagName === 'B') return <strong key={key}>{children}</strong>;
    if (el.tagName === 'EM' || el.tagName === 'I') return <em key={key}>{children}</em>;
    if (el.tagName === 'U') return <u key={key}>{children}</u>;
    return <span key={key}>{children}</span>;
  };

  Array.from(parsed.body.childNodes).forEach((node, i) => {
    nodes.push(render(node, `n-${i}`));
  });

  return <div className="text-sm leading-relaxed">{nodes}</div>;
}
