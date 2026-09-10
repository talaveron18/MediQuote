import { describe, expect, it } from 'vitest'
import { isValidSignaturePngDataUrl } from './signature-image'

const pngHeaderOnly = 'data:image/png;base64,iVBORw0KGgo='

describe('isValidSignaturePngDataUrl', () => {
  it('accepts a PNG data URL with the expected binary signature', () => {
    expect(isValidSignaturePngDataUrl(pngHeaderOnly)).toBe(true)
  })

  it('rejects a forged MIME prefix whose decoded bytes are not PNG', () => {
    expect(isValidSignaturePngDataUrl('data:image/png;base64,QUFBQQ==')).toBe(false)
  })

  it('rejects malformed base64 and non-string values', () => {
    expect(isValidSignaturePngDataUrl('data:image/png;base64,%%%bad%%%')).toBe(false)
    expect(isValidSignaturePngDataUrl(null)).toBe(false)
  })

  it('rejects oversized signature payloads', () => {
    const oversized = 'data:image/png;base64,' + 'A'.repeat(700_000)
    expect(isValidSignaturePngDataUrl(oversized)).toBe(false)
  })
})
