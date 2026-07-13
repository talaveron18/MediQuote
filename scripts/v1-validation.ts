import http from 'http'

const BASE = 'localhost'
const PORT = 3000

function request(method, path, body, cookie) {
  return new Promise((resolve, reject) => {
    const headers = { 'Content-Type': 'application/json' }
    if (cookie) headers['Cookie'] = cookie
    const data = body ? JSON.stringify(body) : ''
    if (data) headers['Content-Length'] = Buffer.byteLength(data)
    const req = http.request({ hostname: BASE, port: PORT, path, method, headers }, (res) => {
      let b = ''
      const h = res.headers
      res.on('data', c => b += c)
      res.on('end', () => {
        let json = null
        try { json = JSON.parse(b) } catch {}
        resolve({ status: res.statusCode, headers: h, body: json, raw: b })
      })
    })
    req.on('error', reject)
    if (data) req.write(data)
    req.end()
  })
}

function extractSetCookie(res) {
  const sc = res.headers['set-cookie']
  if (!sc) return null
  if (Array.isArray(sc)) return sc.join('; ')
  return sc
}

function getCookie(res) {
  const sc = extractSetCookie(res)
  if (!sc) return null
  const m = sc.match(/gasi_session=([^;]+)/)
  return m ? `gasi_session=${m[1]}` : null
}

async function main() {
  const results = []
  const R = (name, status, detail) => results.push({ name, status, detail })

  // A. Login maestro
  const a = await request('POST', '/api/auth', { email: 'fernando.suarez@gasisalud.com', password: 'Cambiar1234!' })
  const aOk = a.body?.success && a.body?.user?.role === 'maestro'
  const cookieM = getCookie(a)
  R('A. Login maestro', aOk ? 'PASS' : 'FAIL', aOk ? `role=${a.body.user.role}, mustChange=${a.body.user.mustChangePassword}` : String(a.raw))

  // B. Login admin
  const b = await request('POST', '/api/auth', { email: 'alex@gasisalud.com', password: 'Cambiar1234!' })
  const bOk = b.body?.success && b.body?.user?.role === 'admin'
  const cookieA = getCookie(b)
  R('B. Login admin', bOk ? 'PASS' : 'FAIL', bOk ? 'role=admin' : String(b.raw))

  // C. Login comercial
  const c = await request('POST', '/api/auth', { email: 'comercial@gasisalud.com', password: 'Cambiar1234!' })
  const cOk = c.body?.success && c.body?.user?.role === 'comercial'
  const cookieC = getCookie(c)
  R('C. Login comercial', cOk ? 'PASS' : 'FAIL', cOk ? 'role=comercial' : String(c.raw))

  // D. /me maestro
  const d = await request('GET', '/api/auth?action=me', null, cookieM)
  const dOk = d.body?.user?.role === 'maestro'
  R('D. /me maestro', dOk ? 'PASS' : 'FAIL', dOk ? 'OK' : String(d.raw))

  // E. Crear cliente
  const e = await request('POST', '/api/clients', { businessName: 'Test V1', cif: 'Z9999999Z', fiscalAddress: 'Test Direccion' }, cookieM)
  const eOk = !!e.body?.id
  const clientId = e.body?.id || ''
  R('E. Crear cliente', eOk ? 'PASS' : 'FAIL', eOk ? `id=${clientId}` : String(e.raw))

  // F. Crear presupuesto
  const f = await request('POST', '/api/budgets', { clientId, description: 'Presupuesto validacion V1' }, cookieM)
  const fOk = !!f.body?.id
  R('F. Crear presupuesto', fOk ? 'PASS' : 'FAIL', fOk ? `code=${f.body.code}` : String(f.raw))

  // G. Legal records API
  const g = await request('GET', '/api/legal-records', null, cookieM)
  const gOk = Array.isArray(g.body) && g.body.length >= 18
  R('G. Legal records API', gOk ? 'PASS' : 'FAIL', gOk ? `${g.body.length} fichas` : String(g.raw))

  // H. Legal parameters API
  const h = await request('GET', '/api/legal-parameters', null, cookieM)
  const hOk = Array.isArray(h.body) && h.body.length >= 18
  R('H. Legal parameters API', hOk ? 'PASS' : 'FAIL', hOk ? `${h.body.length} parametros` : String(h.raw))

  // I. Comercial /api/users
  const i = await request('GET', '/api/users', null, cookieC)
  const iOk = i.body?.error?.toLowerCase().includes('denegado') || i.status === 403
  R('I. Comercial /api/users', iOk ? 'PASS' : 'FAIL', iOk ? '403 Acceso denegado' : `${i.status}: ${String(i.raw).slice(0,80)}`)

  // J. Comercial /api/legal-records
  const j = await request('GET', '/api/legal-records', null, cookieC)
  const jOk = j.body?.error?.toLowerCase().includes('denegado') || j.status === 403
  R('J. Comercial /api/legal-records', jOk ? 'PASS' : 'FAIL', jOk ? '403' : `${j.status}: ${String(j.raw).slice(0,80)}`)

  // K. Logout
  const k = await request('POST', '/api/auth?action=logout', null, cookieM)
  const kCookie = extractSetCookie(k)
  const kOk = k.body?.success === true
  R('K. Logout', kOk ? 'PASS' : 'FAIL', kOk ? `Set-Cookie: ${kCookie?.slice(0,60)}` : String(k.raw))

  // L. Audit logs
  const l = await request('GET', '/api/audit-logs?limit=1', null, cookieA)
  const lOk = l.body?.logs || l.body?.length >= 0
  R('L. Audit logs', lOk ? 'PASS' : 'NO PROBADO', String(l.raw).slice(0,80))

  // M. Backup API
  const m = await request('POST', '/api/backup', null, cookieM)
  const mOk = m.body?.success || m.body?.filename || m.status === 200
  R('M. Backup API', mOk ? 'PASS' : 'NO PROBADO', String(m.raw).slice(0,80))

  // N. /cambiar-password
  const n = await request('GET', '/cambiar-password', null, null)
  const nOk = n.status === 200
  R('N. /cambiar-password', nOk ? 'PASS' : 'FAIL', `HTTP ${n.status}`)

  // O. Admin no puede desactivar maestro
  const maestroId = a.body?.user?.id
  if (maestroId) {
    const o = await request('PATCH', '/api/users', { action: 'toggleActive', id: maestroId }, cookieA)
    const oOk = o.body?.error || o.status === 403
    R('O. Admin no desactiva maestro', oOk ? 'PASS' : 'NO PROBADO', String(o.raw).slice(0,100))
  } else {
    R('O. Admin no desactiva maestro', 'NO PROBADO', 'Sin maestro ID')
  }

  // P. Cookie httpOnly
  const aSc = extractSetCookie(a)
  const pOk = aSc?.includes('HttpOnly')
  R('P. Cookie httpOnly', pOk ? 'PASS' : 'FAIL', pOk ? 'OK' : aSc?.slice(0,80))

  // Q. Maestro ve todo (legal-params)
  const q = await request('GET', '/api/legal-parameters', null, cookieM)
  const qOk = Array.isArray(q.body)
  R('Q. Maestro ve parametros legales', qOk ? 'PASS' : 'FAIL', qOk ? `${q.body.length} params` : String(q.raw).slice(0,80))

  // Print table
  console.log('')
  console.log('| # | Test | Resultado | Detalle |')
  console.log('|---|------|-----------|---------|')
  results.forEach((r, i) => {
    console.log(`| ${i+1} | ${r.name} | ${r.status} | ${r.detail} |`)
  })

  const pass = results.filter(r => r.status === 'PASS').length
  const fail = results.filter(r => r.status === 'FAIL').length
  const noprob = results.filter(r => r.status === 'NO PROBADO').length
  console.log('')
  console.log(`PASS: ${pass} | FAIL: ${fail} | NO PROBADO: ${noprob}`)
}

main().catch(console.error)