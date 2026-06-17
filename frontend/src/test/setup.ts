import '@testing-library/jest-dom/vitest'
import { configure } from '@testing-library/react'

// Cold-cache full runs spin up ~one fork worker per core and transform
// modules in parallel, starving the event loop; testing-library's default
// 1000ms async timeout then intermittently trips on heavy render chains
// (full <App/> mount + auth fetch + route redirect + page render). 4000ms
// is 4x the default — comfortably above observed cold-load chains — and kept
// below vitest's 5000ms testTimeout so a genuinely hung test still surfaces
// waitFor's useful "Unable to find element" error rather than a generic
// timeout kill. Fixes the Phase 7.13 flake (supersedes an earlier
// localStorage hypothesis).
configure({ asyncUtilTimeout: 4000 })

// jsdom doesn't implement these — Radix UI (used by shadcn Select etc.)
// invokes them during interaction. Provide harmless stubs so unit tests
// can drive the Select without crashes.
if (typeof window !== 'undefined') {
  if (!(HTMLElement.prototype as unknown as { hasPointerCapture?: unknown }).hasPointerCapture) {
    HTMLElement.prototype.hasPointerCapture = function () {
      return false
    } as unknown as typeof HTMLElement.prototype.hasPointerCapture
  }
  if (!(HTMLElement.prototype as unknown as { releasePointerCapture?: unknown }).releasePointerCapture) {
    HTMLElement.prototype.releasePointerCapture =
      function () {} as unknown as typeof HTMLElement.prototype.releasePointerCapture
  }
  if (!(HTMLElement.prototype as unknown as { setPointerCapture?: unknown }).setPointerCapture) {
    HTMLElement.prototype.setPointerCapture =
      function () {} as unknown as typeof HTMLElement.prototype.setPointerCapture
  }
  if (!(Element.prototype as unknown as { scrollIntoView?: unknown }).scrollIntoView) {
    Element.prototype.scrollIntoView =
      function () {} as unknown as typeof Element.prototype.scrollIntoView
  }
  if (typeof (globalThis as { ResizeObserver?: unknown }).ResizeObserver === 'undefined') {
    class ResizeObserverStub {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    ;(globalThis as { ResizeObserver: unknown }).ResizeObserver =
      ResizeObserverStub
  }
  // jsdom doesn't implement matchMedia. shadcn's useIsMobile hook
  // (used by Sidebar) calls it on mount. Stub to a desktop-default
  // MediaQueryList shape so tests render predictably.
  if (typeof window.matchMedia !== 'function') {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia
  }
}
