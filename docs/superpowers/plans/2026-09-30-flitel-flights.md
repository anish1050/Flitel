# Flitel Flights Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans. Keep all work in the current folder.

**Goal:** Build the first B2C flight UI with motion inspired by the two supplied videos.

**Architecture:** Next.js App Router pages share a header and a single navigation transition. Query parameters carry validated flight-search state; a small module supplies clearly labelled demonstration fares.

**Tech Stack:** Node 24, Next.js 16, React 19, TypeScript, Tailwind 4, Zod, Vitest.

**Spec:** ../specs/2026-09-30-flitel-flights-design.md

## Constraints

- Reuse the agreed stack; no paid services, live bookings or credentials.
- Keep realistic reference styling and implement responsive, accessible forms.
- Honour reduced motion and native modified-link behavior.

## Tasks

- [x] Write focused search validation and fare tests, observe failure, implement the data module.
- [x] Build the home search, results and details pages using the shared search contract.
- [x] Add one transition owner with a short plane animation and reduced-motion bypass.
- [x] Integrate original destination and plane imagery.
- [x] Run tests, typecheck and build; verify the full UI flow in a browser.

## Review focus

Invalid URL queries must show a recoverable state. Bad dates and identical airports must fail validation. Filters must support an empty state. Rapid navigation must never leave an overlay stuck. Mobile and reduced-motion users must retain the complete flow.

## Verification

Seven tests pass, covering search validation, sample fares, URL state and hash-only navigation. Typecheck and the production build pass. Browser checks covered search, sorting, filters and their empty state, detail navigation, the plane transition, invalid-search recovery, airport validation and mobile keyboard focus. Mobile pages showed no horizontal overflow. Reduced motion has both JavaScript and CSS bypasses; browser preference emulation was unavailable.
