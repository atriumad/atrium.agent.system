import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const locale = process.env.DOCUSAURUS_CURRENT_LOCALE ?? 'en';
const isEs = locale === 'es';

const description = isEs
  ? 'Atrium Docs: la fuente de verdad del Growth System de Atrium. Cinco engines, los datos detrás de un solo score, seis agentes y el plan para construirlo.'
  : 'Atrium Docs: the source of truth for the Atrium Growth System. Five engines, the data behind one score, six agents and the plan to build it.';
const ogAlt = isEs
  ? 'Un sistema que convierte extraños en regulares, con los seis agentes de Atrium'
  : 'A system that turns strangers into regulars, with the six Atrium agents';

const config: Config = {
  title: 'Atrium Docs',
  tagline: isEs ? 'El sistema que convierte extraños en regulares' : 'The system that turns strangers into regulars',
  favicon: 'img/favicon.svg',
  headTags: [
    {tagName: 'link', attributes: {rel: 'apple-touch-icon', sizes: '180x180', href: '/img/apple-touch-icon.png'}},
    {tagName: 'meta', attributes: {name: 'theme-color', media: '(prefers-color-scheme: light)', content: '#ffffff'}},
    {tagName: 'meta', attributes: {name: 'theme-color', media: '(prefers-color-scheme: dark)', content: '#0c1a1f'}},
    {tagName: 'meta', attributes: {name: 'application-name', content: 'Atrium Docs'}},
  ],
  url: 'https://docs.atriumad.com',
  baseUrl: '/',
  noIndex: true, // internal documentation
  onBrokenLinks: 'throw',
  onBrokenAnchors: 'warn',
  markdown: {
    mermaid: true,
    hooks: {onBrokenMarkdownLinks: 'throw'},
  },
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'es'],
    localeConfigs: {
      en: {label: 'English', htmlLang: 'en'},
      es: {label: 'Español', htmlLang: 'es'},
    },
  },
  stylesheets: [
    'https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter+Tight:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap',
  ],
  themes: [
    '@docusaurus/theme-mermaid',
    [
      '@easyops-cn/docusaurus-search-local',
      {hashed: true, language: ['es', 'en'], indexBlog: false, docsRouteBasePath: '/docs', highlightSearchTermsOnTargetPage: true},
    ],
  ],
  presets: [
    [
      'classic',
      {
        docs: {
          routeBasePath: '/docs',
          sidebarPath: './sidebars.ts',
          showLastUpdateTime: false,
        },
        blog: false,
        theme: {customCss: './src/css/custom.css'},
      } satisfies Preset.Options,
    ],
  ],
  themeConfig: {
    image: `img/og-${isEs ? 'es' : 'en'}.png`,
    metadata: [
      {name: 'description', content: description},
      {name: 'keywords', content: 'Atrium, Growth System, restaurant marketing, engines, agents, documentation'},
      {property: 'og:type', content: 'website'},
      {property: 'og:site_name', content: 'Atrium Docs'},
      {property: 'og:locale', content: isEs ? 'es_ES' : 'en_US'},
      {property: 'og:image:width', content: '1200'},
      {property: 'og:image:height', content: '630'},
      {property: 'og:image:alt', content: ogAlt},
      {name: 'twitter:card', content: 'summary_large_image'},
      {name: 'twitter:image:alt', content: ogAlt},
    ],
    colorMode: {defaultMode: 'light', respectPrefersColorScheme: true},
    navbar: {
      title: 'Atrium',
      logo: {alt: 'Atrium', src: 'img/logo.svg', srcDark: 'img/logo-dark.svg'},
      items: [
        {type: 'docSidebar', sidebarId: 'system', label: 'System', position: 'left'},
        {type: 'docSidebar', sidebarId: 'agents', label: 'Agents', position: 'left'},
        {type: 'docSidebar', sidebarId: 'data', label: 'Data', position: 'left'},
        {type: 'docSidebar', sidebarId: 'product', label: 'Product', position: 'left'},
        {type: 'docSidebar', sidebarId: 'architecture', label: 'Architecture', position: 'left'},
        {type: 'docSidebar', sidebarId: 'modules', label: 'Modules', position: 'left'},
        {type: 'docSidebar', sidebarId: 'plan', label: 'Plan', position: 'left'},
        {type: 'docSidebar', sidebarId: 'adr', label: 'Decisions', position: 'right'},
        {type: 'docSidebar', sidebarId: 'guides', label: 'Guides', position: 'right'},
        {type: 'localeDropdown', position: 'right'},
      ],
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['bash', 'json', 'yaml', 'sql', 'diff'],
    },
    mermaid: {theme: {light: 'neutral', dark: 'dark'}, options: {fontFamily: 'Inter Tight, system-ui, sans-serif'}},
    tableOfContents: {minHeadingLevel: 2, maxHeadingLevel: 3},
  } satisfies Preset.ThemeConfig,
};

export default config;
