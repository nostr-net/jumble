import '@testing-library/jest-dom'
import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

// Mock IndexedDB before any modules are loaded
// This needs to be set up synchronously, not in beforeAll
if (typeof globalThis.indexedDB === 'undefined') {
  globalThis.indexedDB = {
    open: vi.fn(() => {
      const request: any = {
        onerror: null,
        onsuccess: null,
        onupgradeneeded: null,
        result: {
          createObjectStore: vi.fn(),
          transaction: {
            objectStore: vi.fn(() => ({
              add: vi.fn(),
              get: vi.fn(),
              put: vi.fn(),
              delete: vi.fn(),
              clear: vi.fn()
            }))
          }
        },
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      }
      // Simulate immediate success
      setTimeout(() => {
        if (request.onsuccess) {
          request.onsuccess({} as any)
        }
      }, 0)
      return request
    })
  } as any
}

// Cleanup after each test
afterEach(() => {
  cleanup()
})

