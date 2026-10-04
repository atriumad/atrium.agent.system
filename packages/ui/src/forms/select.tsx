"use client";

import { Select as BaseSelect } from "@base-ui/react/select";
import { Check, ChevronDown } from "lucide-react";
import { cx } from "../lib/cx";
import { controlBase, itemBase, popupBase } from "./styles";

export type Option = { value: string; label: string; disabled?: boolean };

export type SelectProps = {
  options: Option[];
  value?: string | null;
  defaultValue?: string | null;
  onValueChange?: (value: string | null) => void;
  placeholder?: string;
  name?: string;
  disabled?: boolean;
  required?: boolean;
  "aria-label"?: string;
  className?: string;
};

/** A listbox that matches Input. Put it inside a Field so its label names it. */
export function Select({ options, placeholder = "Select…", className, ...rest }: SelectProps) {
  const items = options.map((o) => ({ value: o.value, label: o.label }));
  return (
    <BaseSelect.Root items={items} {...(rest as object)}>
      <BaseSelect.Trigger
        className={cx(
          controlBase,
          "flex cursor-pointer items-center justify-between gap-2 text-left",
          className,
        )}
      >
        <BaseSelect.Value placeholder={placeholder} />
        <BaseSelect.Icon>
          <ChevronDown size={16} strokeWidth={1.5} aria-hidden="true" />
        </BaseSelect.Icon>
      </BaseSelect.Trigger>
      <BaseSelect.Portal>
        <BaseSelect.Positioner sideOffset={4} className="z-40 outline-none">
          <BaseSelect.Popup className={cx(popupBase, "min-w-(--anchor-width)")}>
            <BaseSelect.List>
              {options.map((o) => (
                <BaseSelect.Item
                  key={o.value}
                  value={o.value}
                  disabled={o.disabled}
                  className={itemBase}
                >
                  <BaseSelect.ItemIndicator className="w-4">
                    <Check size={14} strokeWidth={1.5} aria-hidden="true" />
                  </BaseSelect.ItemIndicator>
                  <BaseSelect.ItemText>{o.label}</BaseSelect.ItemText>
                </BaseSelect.Item>
              ))}
            </BaseSelect.List>
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  );
}
