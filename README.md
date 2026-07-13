# Can I Dine? V3 Product Concept

A design-led Canidine product direction combining the current live site's complete conversion funnel with V2's clearer positioning, honest safety language, guest Safety Passport, and restaurant Service Readiness workflow.

**Live prototype:** https://canidine-v3-concept.vercel.app

## Data boundary

The prototype reads only Canidine's existing public endpoints through a same-origin Vercel rewrite:

- Public restaurant directory
- Public restaurant menus
- Canonical restriction list
- Public pricing

Packaged snapshots provide a fallback if the live public API is unavailable. There are no authentication credentials, private records, write operations, or production mutations.

## Local preview

```bash
python3 -m http.server 4183
```

Local preview uses the packaged real-data snapshot. Vercel uses the live read-only public data first.
