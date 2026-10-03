# atrium

The Atrium Growth System: one monorepo, one modular monolith. Design and decisions live in the
documentation site (`atrium-docs`); the ADRs are copied to `docs/adr/`.

Status: Week 0, repository bootstrapped. Phase F0 starts Monday 5 October 2026.

## Start

```bash
bun install
cp .env.example .env.local   # fill in values
docker compose up -d postgres n8n
bun run ci                   # lint, boundaries, types, tests
```

## Layout

`apps/` surfaces and runtimes · `modules/` business modules · `packages/` shared code ·
`connectors/` N8N exports. See the docs: Architecture → Repository and modules.
