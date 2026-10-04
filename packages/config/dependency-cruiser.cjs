/** Module boundaries from docs: architecture/repository (ADR 0001). */
// Shared pure packages. Workspaces resolve through node_modules, so allow the package name too.
const SHARED = "(packages/|@atrium/)(contracts|scoring)";

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-cross-module",
      comment: "A module may not import another module. Only core and signals expose a public API.",
      severity: "error",
      from: { path: "^modules/([^/]+)/" },
      to: {
        path: "^modules/([^/]+)/",
        pathNot: ["^modules/$1/", "^modules/(core|signals)/index\\.ts$"],
      },
    },
    {
      name: "no-cross-module-packages",
      comment:
        "Workspaces resolve by package name, which the path rule above cannot see. A module may " +
        "import only core, signals (their public API) and the shared packages.",
      severity: "error",
      from: { path: "^modules/([^/]+)/" },
      to: {
        path: "^@atrium/",
        pathNot: ["^@atrium/$1$", "^@atrium/(core|signals|contracts|scoring|policy|config)$"],
      },
    },
    {
      name: "domain-is-pure",
      comment: "domain/ imports only itself, contracts and scoring.",
      severity: "error",
      from: { path: "^modules/[^/]+/domain/" },
      to: {
        pathNot: ["^modules/[^/]+/domain/", `^${SHARED}(/|$)`],
        dependencyTypesNot: ["core"],
      },
    },
    {
      name: "entrypoints-use-application",
      comment: "http/, mcp/ and jobs/ reach infra only through application/.",
      severity: "error",
      from: { path: "^modules/[^/]+/(http|mcp|jobs)/" },
      to: { path: "^modules/[^/]+/infra/" },
    },
    {
      name: "no-circular",
      severity: "error",
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsConfig: { fileName: "tsconfig.json" },
    exclude: { path: "(\\.test\\.ts$|/tests/|/\\.next/)" },
  },
};
