import { describe, expect, it } from 'vitest';
import {
  parseMessageBox,
  parseMessageCreateBody,
  parseMessageReadBody,
  parseSingleMessageId,
} from './message-request-contract';

describe('internal message request contracts', () => {
  it('accepts only an unambiguous inbox/sent selector', () => {
    expect(parseMessageBox('https://example.test/api/messages')).toEqual({ ok: true, box: 'inbox' });
    expect(parseMessageBox('https://example.test/api/messages?box=sent')).toEqual({ ok: true, box: 'sent' });
    expect(parseMessageBox('https://example.test/api/messages?box=other')).toEqual({ ok: false });
    expect(parseMessageBox('https://example.test/api/messages?box=inbox&box=sent')).toEqual({ ok: false });
    expect(parseMessageBox('https://example.test/api/messages?box=inbox&userId=other')).toEqual({ ok: false });
  });

  it('rejects mass-assignment fields while preserving valid create payloads', () => {
    const valid = {
      recipientId: ' user-2 ', subject: ' Hola ', body: ' Mensaje ', budgetId: null, clientId: '',
    };
    expect(parseMessageCreateBody(valid)).toEqual({
      ok: true,
      value: { recipientId: 'user-2', subject: 'Hola', body: 'Mensaje', budgetId: null, clientId: null },
    });
    expect(parseMessageCreateBody({ ...valid, senderId: 'attacker' })).toEqual({ ok: false });
    expect(parseMessageCreateBody({ ...valid, createdAt: '2020-01-01' })).toEqual({ ok: false });
  });

  it('allows PATCH to carry only one non-empty id', () => {
    expect(parseMessageReadBody({ id: ' msg-1 ' })).toEqual({ ok: true, id: 'msg-1' });
    expect(parseMessageReadBody({ id: 'msg-1', recipientId: 'other' })).toEqual({ ok: false });
    expect(parseMessageReadBody({ id: '   ' })).toEqual({ ok: false });
  });

  it('requires exactly one delete id and rejects extra query selectors', () => {
    expect(parseSingleMessageId('https://example.test/api/messages?id=msg-1')).toEqual({ ok: true, id: 'msg-1' });
    expect(parseSingleMessageId('https://example.test/api/messages?id=msg-1&id=msg-2')).toEqual({ ok: false });
    expect(parseSingleMessageId('https://example.test/api/messages?id=msg-1&userId=other')).toEqual({ ok: false });
    expect(parseSingleMessageId('https://example.test/api/messages?id=%20%20')).toEqual({ ok: false });
  });
});
