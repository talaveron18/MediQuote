import { describe, expect, it } from 'vitest'
import { MAXIMUM_SMTP_RESPONSE_BYTES, parseSmtpResponseBuffer } from './smtp-response'

describe('parseSmtpResponseBuffer', () => {
  it('waits for the terminating line of a multiline SMTP response', () => {
    expect(parseSmtpResponseBuffer('250-example.invalid\r\n250-STARTTLS\r\n')).toBeNull()
    expect(parseSmtpResponseBuffer('250-example.invalid\r\n250-STARTTLS\r\n250 AUTH LOGIN\r\n')).toEqual({
      code: 250,
      text: '250-example.invalid\n250-STARTTLS\n250 AUTH LOGIN',
    })
  })

  it('rejects an unterminated response that exceeds the safety ceiling', () => {
    const oversized = `250-${'x'.repeat(MAXIMUM_SMTP_RESPONSE_BYTES)}`
    expect(() => parseSmtpResponseBuffer(oversized)).toThrow(/límite de seguridad/)
  })
})
