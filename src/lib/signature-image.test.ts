import { describe, expect, it } from 'vitest'
import { isValidSignaturePngDataUrl } from './signature-image'

const validOnePixelPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
const pngHeaderOnly = 'data:image/png;base64,iVBORw0KGgo='

describe('isValidSignaturePngDataUrl', () => {
  it('accepts a structurally complete PNG with sane dimensions', () => {
    expect(isValidSignaturePngDataUrl(validOnePixelPng)).toBe(true)
  })

  it('rejects a PNG magic header without mandatory image chunks', () => {
    expect(isValidSignaturePngDataUrl(pngHeaderOnly)).toBe(false)
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

  it('rejects absurd PNG dimensions even when signature and chunks are present', () => {
    const raw = Buffer.from(validOnePixelPng.split(',')[1], 'base64')
    raw.writeUInt32BE(5000, 16)
    const oversizedDimensions = `data:image/png;base64,${raw.toString('base64')}`
    expect(isValidSignaturePngDataUrl(oversizedDimensions)).toBe(false)
  })
})
