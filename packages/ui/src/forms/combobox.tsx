"use client";

import { Combobox as BaseCombobox } from "@base-ui/react/combobox";
import { Check } from "lucide-react";
import { cx } from "../lib/cx";
import type { Option } from "./select";
import { controlBase, itemBase, popupBase } from "./styles";

export type ComboboxProps = {
  options: Option[];
  placeholder?: string;
  emptyLabel?: string;
  name?: string;
  disabled?: boolean;
  "aria-label"?: string;
  className?: string;
};

/** A text input that filters a list: for a client, a location, a long set of choices. */
export function Combobox({
  options,
  placeholder,
  emptyLabel = "No matches.",
  className,
  ...rest
}: ComboboxProps) {
  const items = options.map((o) => ({ value: o.value, label: o.label }));
  return (
    <BaseCombobox.Root items={items} {...(rest as object)}>
      <BaseCombobox.Input placeholder={placeholder} className={cx(controlBase, className)} />
      <BaseCombobox.Portal>
        <BaseCombobox.Positioner sideOffset={4} className="z-40 outline-none">
          <BaseCombobox.Popup
            className={cx(popupBase, "max-h-72 min-w-(--anchor-width) overflow-auto")}
          >
            <BaseCombobox.Empty className="px-2.5 py-2 text-sm text-fg-muted empty:hidden">
              {emptyLabel}
            </BaseCombobox.Empty>
            <BaseCombobox.List>
              {(item: { value: string; label: string }) => (
                <BaseCombobox.Item key={item.value} value={item} className={itemBase}>
                  <BaseCombobox.ItemIndicator className="w-4">
                    <Check size={14} strokeWidth={1.5} aria-hidden="true" />
                  </BaseCombobox.ItemIndicator>
                  {item.label}
                </BaseCombobox.Item>
              )}
            </BaseCombobox.List>
          </BaseCombobox.Popup>
        </BaseCombobox.Positioner>
      </BaseCombobox.Portal>
    </BaseCombobox.Root>
  );
}
