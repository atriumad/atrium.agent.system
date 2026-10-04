"use client";

import { Toast as BaseToast } from "@base-ui/react/toast";
import { X } from "lucide-react";
import type { ReactNode } from "react";

export type ToastInput = {
  title: string;
  description?: string;
  /** One undo-style action. */
  action?: { label: string; onClick: () => void };
  /** Milliseconds before it goes. About five seconds by default. */
  timeout?: number;
};

function Toaster() {
  const { toasts } = BaseToast.useToastManager();
  return (
    <BaseToast.Portal>
      <BaseToast.Viewport className="fixed right-4 bottom-4 z-50 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2">
        {toasts.map((t) => (
          <BaseToast.Root
            key={t.id}
            toast={t}
            className="flex items-center gap-3.5 rounded-sm bg-charcoal-800 px-4 py-3 text-sm text-cream-200 shadow-pop transition-[opacity,transform] duration-(--dur-base) ease-out data-starting-style:translate-y-2 data-starting-style:opacity-0 data-ending-style:opacity-0 dark:bg-cream-200 dark:text-charcoal-900"
          >
            <BaseToast.Content className="min-w-0 flex-1">
              <BaseToast.Title className="m-0 font-medium" />
              <BaseToast.Description className="m-0 text-cream-400 dark:text-charcoal-500" />
            </BaseToast.Content>
            {t.actionProps ? (
              <BaseToast.Action className="cursor-pointer font-medium text-lime-500 underline underline-offset-4 dark:text-clay-700" />
            ) : null}
            {/* Base UI hides this button from assistive technology but leaves it focusable: expose it. */}
            <BaseToast.Close aria-label="Dismiss" aria-hidden={false} className="cursor-pointer">
              <X size={14} strokeWidth={1.5} aria-hidden="true" />
            </BaseToast.Close>
          </BaseToast.Root>
        ))}
      </BaseToast.Viewport>
    </BaseToast.Portal>
  );
}

/** Mount once near the root. A toast confirms something that already happened; an error that needs action is a Banner. */
export function ToastProvider({
  children,
  timeout = 5000,
}: {
  children: ReactNode;
  timeout?: number;
}) {
  return (
    <BaseToast.Provider timeout={timeout}>
      {children}
      <Toaster />
    </BaseToast.Provider>
  );
}

/** `const toast = useToast(); toast.show({title: 'Case marked as contacted'})` */
export function useToast() {
  const manager = BaseToast.useToastManager();
  return {
    show: (input: ToastInput) =>
      manager.add({
        title: input.title,
        ...(input.description ? { description: input.description } : {}),
        ...(input.timeout !== undefined ? { timeout: input.timeout } : {}),
        ...(input.action
          ? { actionProps: { children: input.action.label, onClick: input.action.onClick } }
          : {}),
      }),
    close: (id?: string) => manager.close(id),
  };
}
