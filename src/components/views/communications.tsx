'use client';

import { useCallback, useEffect, useState } from 'react';
import { Mail, MailOpen, RefreshCw, Send, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAppStore } from '@/store/app-store';

type Person = { id: string; name: string; email: string; role: string };
type Message = {
  id: string; subject: string; body: string; createdAt: string; readAt: string | null;
  sender: Person; recipient: Person; budget?: { code: string } | null; client?: { businessName: string } | null;
};
type Approval = {
  id: string; status: string; reason: string; discountPercent: number; semaphore: string | null;
  decisionComment: string | null; createdAt: string; requester: Person; reviewer?: { name: string } | null;
  budget: { code: string; totalFinal: number; client: { businessName: string } };
};

const dateTime = (value: string) => new Date(value).toLocaleString('es-ES');

export default function Communications() {
  const { currentRole } = useAppStore();
  const [users, setUsers] = useState<Person[]>([]);
  const [inbox, setInbox] = useState<Message[]>([]);
  const [sent, setSent] = useState<Message[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [selected, setSelected] = useState<Message | null>(null);
  const [recipientId, setRecipientId] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [comments, setComments] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const [usersRes, inboxRes, sentRes, approvalsRes] = await Promise.all([
        fetch('/api/messages/recipients'),
        fetch('/api/messages?box=inbox'),
        fetch('/api/messages?box=sent'),
        fetch('/api/approvals'),
      ]);
      if (![usersRes, inboxRes, sentRes, approvalsRes].every((response) => response.ok)) {
        throw new Error('No se pudo cargar el buzón interno');
      }
      setUsers((await usersRes.json()).users ?? []);
      setInbox((await inboxRes.json()).messages ?? []);
      setSent((await sentRes.json()).messages ?? []);
      setApprovals((await approvalsRes.json()).approvals ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Error al cargar el buzón');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const openMessage = async (message: Message) => {
    setSelected(message);
    if (!message.readAt && inbox.some((item) => item.id === message.id)) {
      await fetch('/api/messages', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: message.id }),
      });
      setInbox((items) => items.map((item) => item.id === message.id
        ? { ...item, readAt: new Date().toISOString() } : item));
    }
  };

  const sendMessage = async () => {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/messages', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipientId, subject, body }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'No se pudo enviar el mensaje');
      setRecipientId(''); setSubject(''); setBody('');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Error al enviar');
    } finally { setBusy(false); }
  };

  const decide = async (id: string, decision: 'approved' | 'rejected') => {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/approvals', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, decision, comment: comments[id] || '' }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'No se pudo guardar la decisión');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Error al decidir');
    } finally { setBusy(false); }
  };

  const messageList = (messages: Message[], sender: boolean) => (
    <div className="grid gap-3 lg:grid-cols-[360px_1fr]">
      <div className="space-y-2">
        {messages.length === 0 && <p className="text-sm text-gray-500 p-4">No hay mensajes.</p>}
        {messages.map((message) => (
          <button key={message.id} onClick={() => openMessage(message)}
            className={`w-full rounded-lg border p-3 text-left hover:bg-gray-50 ${selected?.id === message.id ? 'border-emerald-500 bg-emerald-50' : 'bg-white'}`}>
            <div className="flex items-center gap-2">
              {!sender && !message.readAt ? <Mail className="h-4 w-4 text-emerald-600" /> : <MailOpen className="h-4 w-4 text-gray-400" />}
              <span className={`truncate text-sm ${!sender && !message.readAt ? 'font-semibold' : ''}`}>{message.subject}</span>
            </div>
            <p className="mt-1 truncate text-xs text-gray-500">{sender ? `Para: ${message.recipient.name}` : `De: ${message.sender.name}`}</p>
            <p className="text-xs text-gray-400">{dateTime(message.createdAt)}</p>
          </button>
        ))}
      </div>
      <Card>
        <CardContent className="p-5">
          {selected ? <>
            <h3 className="text-lg font-semibold">{selected.subject}</h3>
            <p className="mt-1 text-sm text-gray-500">De {selected.sender.name} para {selected.recipient.name} · {dateTime(selected.createdAt)}</p>
            <div className="mt-5 whitespace-pre-wrap rounded-md bg-gray-50 p-4 text-sm leading-6">{selected.body}</div>
          </> : <p className="text-sm text-gray-500">Selecciona un mensaje para leerlo.</p>}
        </CardContent>
      </Card>
    </div>
  );

  return <div className="mx-auto max-w-6xl space-y-5">
    <div className="flex items-center justify-between">
      <div><h1 className="text-2xl font-bold">Buzón interno</h1><p className="text-sm text-gray-500">Mensajes y aprobaciones entre las cuentas de GASI.</p></div>
      <Button variant="outline" onClick={() => void load()} disabled={busy}><RefreshCw className="mr-2 h-4 w-4" />Actualizar</Button>
    </div>
    {error && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
    <Tabs defaultValue="inbox">
      <TabsList>
        <TabsTrigger value="inbox">Recibidos {inbox.filter((item) => !item.readAt).length ? `(${inbox.filter((item) => !item.readAt).length})` : ''}</TabsTrigger>
        <TabsTrigger value="compose">Redactar</TabsTrigger>
        <TabsTrigger value="sent">Enviados</TabsTrigger>
        <TabsTrigger value="approvals">Aprobaciones</TabsTrigger>
      </TabsList>
      <TabsContent value="inbox">{messageList(inbox, false)}</TabsContent>
      <TabsContent value="sent">{messageList(sent, true)}</TabsContent>
      <TabsContent value="compose">
        <Card><CardHeader><CardTitle>Nuevo mensaje</CardTitle></CardHeader><CardContent className="space-y-4">
          <div><label className="mb-1 block text-sm font-medium">Destinatario</label><Select value={recipientId} onValueChange={setRecipientId}><SelectTrigger className="w-full"><SelectValue placeholder="Selecciona una cuenta" /></SelectTrigger><SelectContent>{users.map((user) => <SelectItem key={user.id} value={user.id}>{user.name} · {user.role}</SelectItem>)}</SelectContent></Select></div>
          <div><label className="mb-1 block text-sm font-medium">Asunto</label><Input value={subject} maxLength={180} onChange={(event) => setSubject(event.target.value)} /></div>
          <div><label className="mb-1 block text-sm font-medium">Mensaje</label><Textarea value={body} rows={9} maxLength={10000} onChange={(event) => setBody(event.target.value)} /></div>
          <Button onClick={sendMessage} disabled={busy || !recipientId || !subject.trim() || !body.trim()}><Send className="mr-2 h-4 w-4" />Enviar</Button>
        </CardContent></Card>
      </TabsContent>
      <TabsContent value="approvals" className="space-y-3">
        {approvals.length === 0 && <p className="rounded-md border bg-white p-5 text-sm text-gray-500">No hay solicitudes de aprobación.</p>}
        {approvals.map((approval) => <Card key={approval.id}><CardContent className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold">{approval.budget.code} · {approval.budget.client.businessName}</h3><p className="text-sm text-gray-500">Solicita {approval.requester.name} · {dateTime(approval.createdAt)}</p></div><Badge variant={approval.status === 'rejected' ? 'destructive' : approval.status === 'approved' ? 'default' : 'secondary'}>{approval.status}</Badge></div>
          <p className="mt-3 text-sm">{approval.reason}</p>
          {approval.decisionComment && <p className="mt-2 rounded bg-gray-50 p-3 text-sm">Decisión: {approval.decisionComment}</p>}
          {currentRole === 'maestro' && approval.status === 'pending' && <div className="mt-4 flex flex-col gap-3 md:flex-row"><Input placeholder="Comentario de la decisión" value={comments[approval.id] || ''} onChange={(event) => setComments((all) => ({ ...all, [approval.id]: event.target.value }))} /><Button onClick={() => decide(approval.id, 'approved')} disabled={busy}><Check className="mr-1 h-4 w-4" />Aprobar</Button><Button variant="destructive" onClick={() => decide(approval.id, 'rejected')} disabled={busy}><X className="mr-1 h-4 w-4" />Rechazar</Button></div>}
        </CardContent></Card>)}
      </TabsContent>
    </Tabs>
  </div>;
}

