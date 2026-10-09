# Flitel B2C flights

## Brief

Build the first customer flight experience in the agreed Next.js, React, TypeScript and Tailwind stack. The supplied first video is a travel booking design with a panoramic destination photograph, a floating search panel, blue actions and clean cards. Adapt it for flights. The second video uses smooth orbital movement and changing content; adapt the movement to a passenger jet crossing between pages.

## Scope

- Home: destination hero, usable flight form, destination shortcuts.
- Flight results: selected route, sample fares, stops filter and sorting.
- Flight details: itinerary, baggage and fare information.
- Shared navigation animation: plane and cloud sweep, short duration, no animation for reduced-motion users; normal browser link behavior remains available.
- Responsive desktop and mobile layouts, keyboard labels, focus states.
- Explicit demo status: no live inventory, charges or booking confirmation.

## Data and ownership

The URL holds the search criteria. A small validated module owns airport data and deterministic example fares. A single transition component owns navigation animation. No database or supplier credentials are needed for this visual stage. Supplier integration will replace the demo source in a later request.

## Verification

Check query validation and sample pricing with Vitest. Build and typecheck. Exercise search, filters, details, browser back, same-page links and reduced motion in a browser; inspect desktop and mobile layouts.
