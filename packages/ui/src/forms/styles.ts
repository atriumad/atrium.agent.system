/** Shared class strings for the form controls, so a field looks the same whatever it wraps. */
export const controlBase =
  "w-full rounded-sm border border-field bg-cream-100 px-[13px] py-[11px] text-base leading-[1.4] text-fg-body " +
  "placeholder:text-charcoal-500/80 transition-colors duration-(--dur-base) ease-out " +
  "hover:border-charcoal-800 focus-visible:border-charcoal-800 focus-visible:outline-offset-1 " +
  "data-invalid:border-clay-500 data-disabled:cursor-not-allowed data-disabled:opacity-40 " +
  "dark:bg-transparent dark:text-cream-200 dark:hover:border-cream-300 dark:focus-visible:border-cream-300";

export const popupBase =
  "rounded-md border border-line bg-surface-card p-1.5 text-sm text-fg-body shadow-pop outline-none " +
  "transition-[opacity,transform] duration-(--dur-fast) ease-out data-starting-style:opacity-0 data-ending-style:opacity-0";

export const itemBase =
  "flex cursor-pointer items-center gap-2.5 rounded-sm px-2.5 py-2 text-sm outline-none select-none " +
  "data-highlighted:bg-cream-300 dark:data-highlighted:bg-charcoal-700 data-disabled:cursor-not-allowed data-disabled:opacity-40";
