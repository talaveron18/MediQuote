export type MessageBox = 'inbox' | 'sent';

export type MessageCreateInput = {
  recipientId: string;
  subject: string;
  body: string;
  budgetId: string | null;
  clientId: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]) {
  const allowedSet = new Set(allowed);
  return Object.keys(value).every((key) => allowedSet.has(key));
}

export function parseMessageBox(url: string): { ok: true; box: MessageBox } | { ok: false } {
  const params = new URL(url).searchParams;
  if ([...params.keys()].some((key) => key !== 'box')) return { ok: false };
  const boxes = params.getAll('box');
  if (boxes.length === 0) return { ok: true, box: 'inbox' };
  if (boxes.length !== 1 || (boxes[0] !== 'inbox' && boxes[0] !== 'sent')) return { ok: false };
  return { ok: true, box: boxes[0] };
}

export function parseMessageCreateBody(value: unknown): { ok: true; value: MessageCreateInput } | { ok: false } {
  if (!isRecord(value) || !hasOnlyKeys(value, ['recipientId', 'subject', 'body', 'budgetId', 'clientId'])) {
    return { ok: false };
  }

  const recipientId = typeof value.recipientId === 'string' ? value.recipientId.trim() : '';
  const subject = typeof value.subject === 'string' ? value.subject.trim() : '';
  const body = typeof value.body === 'string' ? value.body.trim() : '';
  const budgetId = value.budgetId === undefined || value.budgetId === null || value.budgetId === ''
    ? null : typeof value.budgetId === 'string' ? value.budgetId.trim() : undefined;
  const clientId = value.clientId === undefined || value.clientId === null || value.clientId === ''
    ? null : typeof value.clientId === 'string' ? value.clientId.trim() : undefined;

  if (!recipientId || !subject || !body || budgetId === undefined || clientId === undefined) return { ok: false };
  if ((budgetId !== null && !budgetId) || (clientId !== null && !clientId)) return { ok: false };
  if (subject.length > 180 || body.length > 10_000) return { ok: false };

  return { ok: true, value: { recipientId, subject, body, budgetId, clientId } };
}

export function parseMessageReadBody(value: unknown): { ok: true; id: string } | { ok: false } {
  if (!isRecord(value) || !hasOnlyKeys(value, ['id']) || typeof value.id !== 'string' || !value.id.trim()) {
    return { ok: false };
  }
  return { ok: true, id: value.id.trim() };
}

export function parseSingleMessageId(url: string): { ok: true; id: string } | { ok: false } {
  const params = new URL(url).searchParams;
  if ([...params.keys()].some((key) => key !== 'id')) return { ok: false };
  const ids = params.getAll('id');
  if (ids.length !== 1 || !ids[0].trim()) return { ok: false };
  return { ok: true, id: ids[0].trim() };
}
