import net from 'node:net'
import tls from 'node:tls'
import type { Socket } from 'node:net'
import type { TLSSocket } from 'node:tls'
import { parseSmtpResponseBuffer } from './smtp-response'

export type PasswordRecoveryDeliveryInput = {
  recipient: string
  resetUrl: string
  expiresAt: Date
}

type DeliveryConfigInput = {
  host?: string | null
  port?: string | number | null
  from?: string | null
  password?: string | null
}

export type PasswordRecoverySmtpConfig = {
  host: string
  port: number
  from: string
  username: string
  password: string
}

type SmtpSocket = Socket | TLSSocket

function clean(value: string | null | undefined) {
  return value?.trim() ?? ''
}

function validMailbox(value: string) {
  return /^[^@\s\r\n]+@[^@\s\r\n]+\.[^@\s\r\n]+$/.test(value)
}

export function validatePasswordRecoveryDeliveryConfig(input: DeliveryConfigInput): PasswordRecoverySmtpConfig {
  const host = clean(input.host)
  const from = clean(input.from).toLowerCase()
  const password = input.password ?? ''
  const portRaw = typeof input.port === 'number' ? String(input.port) : clean(input.port)
  const port = Number(portRaw)

  if (!host) throw new Error('GASI_RECOVERY_SMTP_HOST no configurado')
  if (/[/@\s]/.test(host) || host.includes(':')) throw new Error('GASI_RECOVERY_SMTP_HOST no es un nombre de servidor válido')
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('GASI_RECOVERY_SMTP_PORT no es válido')
  if (!validMailbox(from)) throw new Error('GASI_RECOVERY_SMTP_FROM no es una dirección válida')
  if (!password) throw new Error('GASI_RECOVERY_SMTP_PASSWORD no configurado')

  // Don Dominio documenta que la autenticación SMTP usa la cuenta de correo
  // completa como usuario. No se deduce ninguna credencial adicional: el
  // remitente configurado es también el usuario SMTP y la contraseña solo se
  // obtiene del secreto protegido del entorno.
  return { host, port, from, username: from, password }
}

export function buildPasswordRecoveryEmail(input: PasswordRecoveryDeliveryInput, from: string) {
  const recipient = clean(input.recipient).toLowerCase()
  if (!validMailbox(recipient)) throw new Error('Destinatario de recuperación no válido')
  if (!validMailbox(from)) throw new Error('Remitente de recuperación no válido')

  let resetUrl: URL
  try {
    resetUrl = new URL(input.resetUrl)
  } catch {
    throw new Error('URL de recuperación no válida')
  }
  // A recovery token is a bearer credential. Never put it in an email over
  // clear-text HTTP, even if a caller accidentally supplies such an origin.
  if (resetUrl.protocol !== 'https:') throw new Error('URL de recuperación no segura')

  const subject = 'Restablecimiento de contraseña de MediQuote'
  const body = [
    'Se ha solicitado restablecer la contraseña de tu cuenta de MediQuote.',
    '',
    'Utiliza este enlace de un solo uso:',
    resetUrl.toString(),
    '',
    `El enlace caduca el ${input.expiresAt.toISOString()}.`,
    '',
    'Si no has solicitado este cambio, ignora este mensaje.',
  ].join('\r\n')

  const message = [
    `From: GASI MediQuote <${from}>`,
    `To: ${recipient}`,
    `Subject: ${subject}`,
    `Date: ${new Date().toUTCString()}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    'Auto-Submitted: auto-generated',
    '',
    body,
  ].join('\r\n')

  // SMTP dot-stuffing prevents a line in the message from terminating DATA.
  return { recipient, message: message.replace(/(^|\r\n)\./g, '$1..') }
}

function smtpResponse(socket: SmtpSocket): Promise<{ code: number; text: string }> {
  return new Promise((resolve, reject) => {
    let buffer = ''
    const cleanup = () => {
      socket.off('data', onData)
      socket.off('error', onError)
      socket.off('close', onClose)
    }
    const onError = () => {
      cleanup()
      reject(new Error('Fallo de conexión SMTP'))
    }
    const onClose = () => {
      cleanup()
      reject(new Error('Conexión SMTP cerrada inesperadamente'))
    }
    const onData = (chunk: Buffer | string) => {
      buffer += chunk.toString()
      try {
        const parsed = parseSmtpResponseBuffer(buffer)
        if (!parsed) return
        cleanup()
        resolve(parsed)
      } catch (error) {
        cleanup()
        reject(error instanceof Error ? error : new Error('Respuesta SMTP no válida'))
      }
    }
    socket.on('data', onData)
    socket.once('error', onError)
    socket.once('close', onClose)
  })
}

async function expectCode(socket: SmtpSocket, expected: number | number[]) {
  const result = await smtpResponse(socket)
  const allowed = Array.isArray(expected) ? expected : [expected]
  if (!allowed.includes(result.code)) throw new Error(`Servidor SMTP rechazó la operación (${result.code})`)
  return result
}

async function command(socket: SmtpSocket, value: string, expected: number | number[]) {
  socket.write(`${value}\r\n`)
  return expectCode(socket, expected)
}

function connectPlain(host: string, port: number): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host, port })
    const onError = () => reject(new Error('No se pudo conectar con el servidor SMTP'))
    socket.once('error', onError)
    socket.once('connect', () => {
      socket.off('error', onError)
      socket.setTimeout(15_000, () => socket.destroy(new Error('SMTP timeout')))
      resolve(socket)
    })
  })
}

function upgradeStartTls(socket: Socket, host: string): Promise<TLSSocket> {
  return new Promise((resolve, reject) => {
    const secure = tls.connect({ socket, servername: host, minVersion: 'TLSv1.2' })
    const onError = () => reject(new Error('No se pudo establecer STARTTLS con el servidor SMTP'))
    secure.once('error', onError)
    secure.once('secureConnect', () => {
      secure.off('error', onError)
      resolve(secure)
    })
  })
}

/**
 * SMTP directo para la cuenta corporativa GASI alojada en Don Dominio.
 *
 * Seguridad:
 * - host, puerto, remitente y contraseña se leen exclusivamente del entorno;
 * - la contraseña nunca forma parte de errores, logs ni documentación;
 * - se exige STARTTLS antes de AUTH LOGIN;
 * - el usuario SMTP es la cuenta completa, conforme a la documentación oficial
 *   de Don Dominio para sus cuentas de correo.
 */
export async function deliverPasswordRecoveryLink(input: PasswordRecoveryDeliveryInput): Promise<void> {
  const config = validatePasswordRecoveryDeliveryConfig({
    host: process.env.GASI_RECOVERY_SMTP_HOST,
    port: process.env.GASI_RECOVERY_SMTP_PORT,
    from: process.env.GASI_RECOVERY_SMTP_FROM,
    password: process.env.GASI_RECOVERY_SMTP_PASSWORD,
  })
  const email = buildPasswordRecoveryEmail(input, config.from)

  let plain: Socket | null = null
  let secure: TLSSocket | null = null
  try {
    plain = await connectPlain(config.host, config.port)
    await expectCode(plain, 220)
    await command(plain, 'EHLO mediquote.gasi', 250)
    await command(plain, 'STARTTLS', 220)

    secure = await upgradeStartTls(plain, config.host)
    plain = null
    await command(secure, 'EHLO mediquote.gasi', 250)
    await command(secure, 'AUTH LOGIN', 334)
    await command(secure, Buffer.from(config.username, 'utf8').toString('base64'), 334)
    await command(secure, Buffer.from(config.password, 'utf8').toString('base64'), 235)
    await command(secure, `MAIL FROM:<${config.from}>`, 250)
    await command(secure, `RCPT TO:<${email.recipient}>`, [250, 251])
    await command(secure, 'DATA', 354)
    secure.write(`${email.message}\r\n.\r\n`)
    await expectCode(secure, 250)
    await command(secure, 'QUIT', 221).catch(() => null)
  } catch (error) {
    if (error instanceof Error && /SMTP|STARTTLS|Destinatario|Remitente|URL/.test(error.message)) throw error
    throw new Error('No se pudo entregar el correo de recuperación por SMTP')
  } finally {
    secure?.destroy()
    plain?.destroy()
  }
}
