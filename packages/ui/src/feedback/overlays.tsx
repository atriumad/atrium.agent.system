"use client";

import { AlertDialog as BaseAlertDialog } from "@base-ui/react/alert-dialog";
import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { Drawer as BaseDrawer } from "@base-ui/react/drawer";
import { Menu as BaseMenu } from "@base-ui/react/menu";
import { Popover as BasePopover } from "@base-ui/react/popover";
import { Separator } from "@base-ui/react/separator";
import { Tooltip as BaseTooltip } from "@base-ui/react/tooltip";
import { X } from "lucide-react";
import type { ComponentProps, ReactElement, ReactNode } from "react";
import { Button } from "../actions/button";
import { itemBase, popupBase } from "../forms/styles";
import { cx } from "../lib/cx";

/* ---- Tooltip ---- */

/** Names an icon-only control, or explains a term in one line. Opens on hover and on focus; never holds anything to click. */
export function Tooltip({ label, children }: { label: string; children: ReactElement }) {
  return (
    <BaseTooltip.Provider>
      <BaseTooltip.Root>
        <BaseTooltip.Trigger render={children} />
        <BaseTooltip.Portal>
          <BaseTooltip.Positioner sideOffset={8} className="z-50">
            <BaseTooltip.Popup className="rounded-xs bg-charcoal-800 px-2.5 py-1.5 text-xs text-cream-200 transition-opacity duration-(--dur-base) data-starting-style:opacity-0 data-ending-style:opacity-0 dark:bg-cream-200 dark:text-charcoal-900">
              {label}
            </BaseTooltip.Popup>
          </BaseTooltip.Positioner>
        </BaseTooltip.Portal>
      </BaseTooltip.Root>
    </BaseTooltip.Provider>
  );
}

/* ---- Popover ---- */

export type PopoverProps = {
  trigger: ReactElement;
  title?: string;
  children: ReactNode;
  className?: string;
} & Pick<ComponentProps<typeof BasePopover.Root>, "open" | "onOpenChange" | "defaultOpen">;

/** A small floating panel anchored to its trigger: a filter, a date, an explanation. */
export function Popover({ trigger, title, children, className, ...root }: PopoverProps) {
  return (
    <BasePopover.Root {...root}>
      <BasePopover.Trigger render={trigger} />
      <BasePopover.Portal>
        <BasePopover.Positioner sideOffset={6} className="z-40">
          <BasePopover.Popup className={cx(popupBase, className ?? "w-72 p-4")}>
            {title ? (
              <BasePopover.Title className="m-0 mb-2 text-lg leading-tight font-normal tracking-tight">
                {title}
              </BasePopover.Title>
            ) : null}
            {children}
          </BasePopover.Popup>
        </BasePopover.Positioner>
      </BasePopover.Portal>
    </BasePopover.Root>
  );
}

/* ---- Dialog ---- */

const backdrop =
  "fixed inset-0 z-40 bg-charcoal-800/55 transition-opacity duration-(--dur-base) data-starting-style:opacity-0 data-ending-style:opacity-0";
const dialogPopup =
  "fixed top-1/2 left-1/2 z-50 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-charcoal-800 bg-surface-card p-6 text-fg-body shadow-pop transition-[opacity,transform] duration-(--dur-base) ease-out data-starting-style:scale-[0.99] data-starting-style:opacity-0 data-ending-style:opacity-0 dark:border-cream-300";

export type DialogProps = {
  trigger?: ReactElement;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  /** The buttons. Name the action ("Delete reply"), never "OK". */
  actions?: ReactNode;
  closeLabel?: string;
} & Pick<ComponentProps<typeof BaseDialog.Root>, "open" | "onOpenChange" | "defaultOpen">;

/** Interrupts, so it is for a decision that cannot wait. Traps focus, closes on Escape, returns focus to its trigger. */
export function Dialog({
  trigger,
  title,
  description,
  children,
  actions,
  closeLabel = "Close",
  ...root
}: DialogProps) {
  return (
    <BaseDialog.Root {...root}>
      {trigger ? <BaseDialog.Trigger render={trigger} /> : null}
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className={backdrop} />
        <BaseDialog.Popup className={dialogPopup}>
          <BaseDialog.Close
            aria-label={closeLabel}
            className="absolute top-4 right-4 cursor-pointer text-fg-muted hover:text-fg-strong"
          >
            <X size={16} strokeWidth={1.5} aria-hidden="true" />
          </BaseDialog.Close>
          <BaseDialog.Title className="m-0 pr-8 text-2xl leading-[1.05] font-normal tracking-tight text-fg-strong">
            {title}
          </BaseDialog.Title>
          {description ? (
            <BaseDialog.Description className="mt-2.5 mb-0 text-sm text-fg-muted">
              {description}
            </BaseDialog.Description>
          ) : null}
          {children ? <div className="mt-4">{children}</div> : null}
          {actions ? <div className="mt-6 flex justify-end gap-2">{actions}</div> : null}
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}

export type ConfirmDialogProps = {
  trigger: ReactElement;
  title: string;
  description: ReactNode;
  /** The destructive verb: "Delete reply". */
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  /** Destructive actions use the clay button after a confirmation. */
  tone?: "clay" | "primary";
};

/** A confirmation that cannot be dismissed by clicking outside: an alert dialog. */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel,
  cancelLabel = "Keep it",
  onConfirm,
  tone = "clay",
}: ConfirmDialogProps) {
  return (
    <BaseAlertDialog.Root>
      <BaseAlertDialog.Trigger render={trigger} />
      <BaseAlertDialog.Portal>
        <BaseAlertDialog.Backdrop className={backdrop} />
        <BaseAlertDialog.Popup className={dialogPopup}>
          <BaseAlertDialog.Title className="m-0 text-2xl leading-[1.05] font-normal tracking-tight text-fg-strong">
            {title}
          </BaseAlertDialog.Title>
          <BaseAlertDialog.Description className="mt-2.5 mb-0 text-sm text-fg-muted">
            {description}
          </BaseAlertDialog.Description>
          <div className="mt-6 flex justify-end gap-2">
            <BaseAlertDialog.Close render={<Button variant="ghost">{cancelLabel}</Button>} />
            <BaseAlertDialog.Close
              render={
                <Button variant={tone} onClick={onConfirm}>
                  {confirmLabel}
                </Button>
              }
            />
          </div>
        </BaseAlertDialog.Popup>
      </BaseAlertDialog.Portal>
    </BaseAlertDialog.Root>
  );
}

/* ---- Drawer ---- */

export type DrawerProps = {
  trigger?: ReactElement;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  side?: "right" | "left";
  closeLabel?: string;
} & Pick<ComponentProps<typeof BaseDrawer.Root>, "open" | "onOpenChange" | "defaultOpen">;

/** A panel from the edge: the case detail on a phone, filters, a long form. */
export function Drawer({
  trigger,
  title,
  description,
  children,
  side = "right",
  closeLabel = "Close",
  ...root
}: DrawerProps) {
  return (
    <BaseDrawer.Root {...root}>
      {trigger ? <BaseDrawer.Trigger render={trigger} /> : null}
      <BaseDrawer.Portal>
        <BaseDrawer.Backdrop className={backdrop} />
        <BaseDrawer.Popup
          className={cx(
            "fixed top-0 bottom-0 z-50 w-[min(26rem,100vw)] overflow-auto border-charcoal-800 bg-surface-card p-6 shadow-pop",
            side === "right" ? "right-0 border-l" : "left-0 border-r",
          )}
        >
          <div className="flex items-start justify-between gap-4">
            <BaseDrawer.Title className="m-0 text-2xl leading-[1.05] font-normal tracking-tight text-fg-strong">
              {title}
            </BaseDrawer.Title>
            <BaseDrawer.Close
              aria-label={closeLabel}
              className="cursor-pointer text-fg-muted hover:text-fg-strong"
            >
              <X size={16} strokeWidth={1.5} aria-hidden="true" />
            </BaseDrawer.Close>
          </div>
          {description ? (
            <BaseDrawer.Description className="mt-2.5 mb-0 text-sm text-fg-muted">
              {description}
            </BaseDrawer.Description>
          ) : null}
          <div className="mt-5">{children}</div>
        </BaseDrawer.Popup>
      </BaseDrawer.Portal>
    </BaseDrawer.Root>
  );
}

/* ---- Menu ---- */

export type MenuEntry =
  | { label: string; icon?: ReactNode; onSelect?: () => void; danger?: boolean; disabled?: boolean }
  | "separator";

export type MenuProps = { trigger: ReactElement; items: MenuEntry[]; className?: string };

/** Actions for one item. Destructive actions go last, after a separator, in clay. */
export function Menu({ trigger, items, className }: MenuProps) {
  return (
    <BaseMenu.Root>
      <BaseMenu.Trigger render={trigger} />
      <BaseMenu.Portal>
        <BaseMenu.Positioner sideOffset={6} className="z-40">
          <BaseMenu.Popup className={cx(popupBase, "min-w-48", className)}>
            {items.map((it, i) =>
              it === "separator" ? (
                <Separator key={i} className="my-1.5 h-px bg-line" />
              ) : (
                <BaseMenu.Item
                  key={it.label}
                  disabled={it.disabled}
                  onClick={it.onSelect}
                  className={cx(itemBase, it.danger && "text-clay-600 dark:text-clay-300")}
                >
                  {it.icon}
                  {it.label}
                </BaseMenu.Item>
              ),
            )}
          </BaseMenu.Popup>
        </BaseMenu.Positioner>
      </BaseMenu.Portal>
    </BaseMenu.Root>
  );
}
