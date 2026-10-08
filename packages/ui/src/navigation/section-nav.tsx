export type SectionLink = { href: string; label: string; current?: boolean };

/** The few places a signed-in person can go, as wide-caps links over the page. */
export function SectionNav({ links }: { links: SectionLink[] }) {
  return (
    <nav aria-label="Sections" className="flex gap-5">
      {links.map((l) => (
        <a
          key={l.href}
          href={l.href}
          aria-current={l.current ? "page" : undefined}
          className="label-caps pb-1 text-fg-muted hover:text-fg-strong aria-[current=page]:border-b-2 aria-[current=page]:border-charcoal-800 aria-[current=page]:text-fg-strong dark:aria-[current=page]:border-lime-500"
        >
          {l.label}
        </a>
      ))}
    </nav>
  );
}
