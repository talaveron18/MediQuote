'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';

type Proposal = {
  code: string; validUntil?: string; description?: string; location: string;
  client: { businessName: string; cif: string };
  subtotal: number; discountPercent: number; discountAmount: number; ivaAmount: number; totalFinal: number;
  serviceBlocks: Array<{ serviceName: string; professionalCategory: string; totalWorkingDays: number; totalHours: number; blockTotalFinal: number }>;
};

const eur = (value: number) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(value);

export default function SignaturePage() {
  const token = String(useParams().token ?? '');
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const touched = useRef(false);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [recipientEmail, setRecipientEmail] = useState('');
  const [consentText, setConsentText] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState<'loading' | 'pending' | 'sending' | 'accepted'>('loading');

  useEffect(() => {
    fetch(`/api/public/signature?token=${encodeURIComponent(token)}`, { cache: 'no-store' })
      .then(async response => ({ ok: response.ok, data: await response.json() }))
      .then(({ ok, data }) => {
        if (data.status === 'accepted') { setStatus('accepted'); return; }
        if (!ok || !data.budget) throw new Error(data.error || 'No se pudo abrir el presupuesto');
        setProposal(data.budget); setRecipientEmail(data.recipientEmail); setEmail(data.recipientEmail);
        setConsentText(data.consentText); setStatus('pending');
      }).catch(reason => { setError(reason.message); setStatus('pending'); });
  }, [token]);

  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const target = canvas.current!; const rect = target.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * target.width / rect.width, y: (event.clientY - rect.top) * target.height / rect.height };
  }
  function start(event: React.PointerEvent<HTMLCanvasElement>) {
    drawing.current = true; touched.current = true; event.currentTarget.setPointerCapture(event.pointerId);
    const p = point(event); const context = canvas.current!.getContext('2d')!; context.beginPath(); context.moveTo(p.x, p.y);
  }
  function move(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return; const p = point(event); const context = canvas.current!.getContext('2d')!;
    context.strokeStyle = '#10233f'; context.lineWidth = 2.5; context.lineCap = 'round'; context.lineTo(p.x, p.y); context.stroke();
  }
  function clear() { canvas.current?.getContext('2d')?.clearRect(0, 0, 900, 240); touched.current = false; }
  async function sign() {
    if (!touched.current) { setError('Dibuje su firma en el recuadro'); return; }
    setStatus('sending'); setError('');
    const response = await fetch('/api/public/signature', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      token, signerName: name, signerEmail: email, consent, signatureData: canvas.current!.toDataURL('image/png'),
    }) });
    const data = await response.json();
    if (!response.ok) { setError(data.error || 'No se pudo firmar'); setStatus('pending'); return; }
    setStatus('accepted');
  }

  if (status === 'loading') return <main style={{ padding: 40, fontFamily: 'Arial' }}>Cargando presupuesto…</main>;
  if (status === 'accepted') return <main style={{ maxWidth: 720, margin: '60px auto', padding: 32, fontFamily: 'Arial', textAlign: 'center' }}><img src="/gasi-logo.png" alt="GASI" style={{ width: 180 }} /><h1 style={{ color: '#07579b' }}>Presupuesto firmado y aceptado</h1><p>GASI ha recibido automáticamente la aceptación. Puede cerrar esta ventana.</p></main>;
  if (!proposal) return <main style={{ padding: 40, fontFamily: 'Arial' }}><h1>No se puede abrir el presupuesto</h1><p>{error}</p></main>;

  return <main style={{ maxWidth: 900, margin: '24px auto', padding: 24, fontFamily: 'Arial', color: '#172033' }}>
    <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '3px solid #07579b', paddingBottom: 16 }}><img src="/gasi-logo.png" alt="GASI" style={{ width: 180 }} /><div style={{ textAlign: 'right' }}><h1 style={{ margin: 0 }}>Presupuesto {proposal.code}</h1><div>Validez: {proposal.validUntil || '—'}</div></div></header>
    <section style={{ background: '#f4f7fa', borderRadius: 10, padding: 18, marginTop: 22 }}><b>{proposal.client.businessName}</b><div>CIF: {proposal.client.cif}</div><div>Lugar del servicio: {proposal.location}</div></section>
    <h2>Servicios</h2>{proposal.serviceBlocks.map((block, index) => <section key={index} style={{ borderBottom: '1px solid #d7dee8', padding: '12px 0' }}><b>{index + 1}. {block.serviceName}</b><div>{block.professionalCategory} · {block.totalWorkingDays} días · {block.totalHours.toLocaleString('es-ES')} h</div>{block.blockTotalFinal > 0 && <div style={{ textAlign: 'right' }}>{eur(block.blockTotalFinal)}</div>}</section>)}
    <section style={{ margin: '22px 0 32px auto', maxWidth: 400 }}><div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Subtotal</span><span>{eur(proposal.subtotal)}</span></div>{proposal.discountAmount > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', color: '#b42318' }}><span>Descuento ({proposal.discountPercent}%)</span><span>−{eur(proposal.discountAmount)}</span></div>}<div style={{ display: 'flex', justifyContent: 'space-between' }}><span>IVA</span><span>{eur(proposal.ivaAmount)}</span></div><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 22, fontWeight: 700, borderTop: '2px solid #07579b', paddingTop: 8 }}><span>Total</span><span>{eur(proposal.totalFinal)}</span></div></section>
    <section style={{ border: '1px solid #b8c5d5', borderRadius: 10, padding: 20 }}><h2>Firma y aceptación</h2><label>Nombre completo del firmante<input value={name} onChange={event => setName(event.target.value)} style={{ display: 'block', width: '100%', padding: 10, margin: '6px 0 14px', boxSizing: 'border-box' }} /></label><label>Correo del destinatario<input value={email} onChange={event => setEmail(event.target.value)} style={{ display: 'block', width: '100%', padding: 10, margin: '6px 0 14px', boxSizing: 'border-box' }} /></label><div>Firma manuscrita</div><canvas ref={canvas} width={900} height={240} onPointerDown={start} onPointerMove={move} onPointerUp={() => drawing.current = false} onPointerCancel={() => drawing.current = false} style={{ width: '100%', height: 180, border: '1px dashed #64748b', touchAction: 'none', background: 'white' }} /><button type="button" onClick={clear} style={{ marginTop: 6 }}>Borrar firma</button><label style={{ display: 'flex', gap: 10, margin: '18px 0' }}><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} /><span>{consentText}</span></label>{error && <p style={{ color: '#b42318' }}>{error}</p>}<button type="button" disabled={status === 'sending'} onClick={sign} style={{ background: '#07579b', color: 'white', border: 0, borderRadius: 7, padding: '13px 22px', fontWeight: 700 }}>{status === 'sending' ? 'Firmando…' : 'Firmar y aceptar presupuesto'}</button><p style={{ fontSize: 12, color: '#667085' }}>Enlace personal enviado a {recipientEmail}. Se registra la fecha, huella del documento y trazabilidad técnica de la aceptación.</p></section>
  </main>;
}
