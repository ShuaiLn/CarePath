import { describe, it, expect } from 'vitest'
import { isLoopbackUrl } from './loopbackGuard'

describe('isLoopbackUrl', () => {
  it.each(['http://127.0.0.1:11434', 'http://127.0.0.1', 'http://localhost:11434', 'http://localhost', 'http://[::1]:11434', 'http://[::1]'])(
    'accepts %s',
    (url) => {
      expect(isLoopbackUrl(url)).toBe(true)
    },
  )

  it.each([
    'https://my-ollama.example.com',
    'https://ollama.com',
    'http://203.0.113.5:11434',
    'http://192.168.1.10:11434',
    'http://127.0.0.2:11434',
    'not a url',
    '',
  ])('rejects %s', (url) => {
    expect(isLoopbackUrl(url)).toBe(false)
  })
})
