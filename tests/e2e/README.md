Authentication browser tests start a local Vite server and intercept Felslager's login, logout, session and filesystem endpoints. They cover save resumption, explicit retries after session expiry, keyboard navigation, and preservation of localStorage and IndexedDB drafts.

Run `npm run test:e2e:auth`, or select an engine with `npm run test:e2e:auth -- --project=chromium`. Install browser binaries and host dependencies with Playwright first. These mocked tests do not verify cross-origin cookie configuration against a running Felslager service.
