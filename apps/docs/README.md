# Atrium Docs

Documentación del Atrium Growth System y de su plataforma, construida con [Docusaurus](https://docusaurus.io/) 3.10.

Idiomas: inglés (por defecto, `docs/`) y español (`i18n/es/`), con el mismo nombre de archivo en las dos carpetas. Cuando cambia una página, se actualizan las dos.

## Uso

```bash
bun install
bun run dev                 # http://localhost:3000, un idioma a la vez
bun run dev --locale es     # la versión en español
bun run build               # sitio estático en build/ para los dos idiomas, valida enlaces rotos
bun run serve               # sirve el build, con el selector de idioma
```

## Estructura

- `docs/system` — engines, recorrido del cliente, servicios y paquetes, métricas y Growth Score, riesgos
- `docs/agents` — Maître y los cinco agentes de engine, autonomía, interacción
- `docs/data` — signals, fuentes, métricas y scoring, almacenamiento, hoja manual
- `docs/product` — Platform, Manager, Mobile, paquetes y acceso
- `docs/architecture` — principios, stack, repositorio, eventos, integraciones, agentes y MCP, seguridad
- `docs/modules` — Core, Signals, Discoverability, Content, Ops, Reputation, CRM, Growth, Reports, Booker
- `docs/plan` — fases, puertas, pruebas, mandala 9×9, decisiones abiertas
- `docs/adr` — registro de decisiones de arquitectura
- `docs/guides` — desarrollo local, convenciones, crear módulos, subagentes, conectores y métricas
- `guides-rules/` — material de origen (prototipos HTML); referencia de diseño, no se publica

Destino final: `apps/docs` del monorepo de Atrium.

## Despliegue (Vercel)

El sitio es estático (`bun run build` → `build/`, con `/` en inglés y `/es/` en español). La configuración vive en `vercel.json`: instala con Bun, construye, sirve `build/`, usa URLs limpias y envía `noindex` (es documentación interna).

1. Subir el repo a GitHub (privado).
2. En Vercel: **Add New → Project**, importar el repo. El preset es *Docusaurus*; no hace falta cambiar nada (lo toma de `vercel.json`).
3. **Settings → Domains**: agregar `docs.atriumad.com` y crear el registro DNS que indique Vercel.
4. Restringir el acceso si hace falta (Vercel Authentication o password, según el plan).

Cada pull request recibe una URL de preview. El workflow `.github/workflows/ci.yml` corre el typecheck y el build de ambos idiomas, y falla si hay un enlace roto.

## Licencia

Material propietario y confidencial de Atrium Agency. **Todos los derechos reservados**: no se concede ninguna licencia de uso, copia ni distribución (ver `LICENSE`). El software de terceros conserva sus propias licencias (ver `THIRD_PARTY_NOTICES.md`). Mantener el repositorio **privado**.
