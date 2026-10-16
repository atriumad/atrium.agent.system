import { describe, expect, mock, test } from "bun:test";
import {
  Badge,
  Banner,
  Button,
  ConfirmDialog,
  Dialog,
  Drawer,
  EmptyState,
  ErrorState,
  Menu,
  Popover,
  Spinner,
  StatusBadge,
  ToastProvider,
  Tooltip,
  useToast,
} from "../src";
import { screen, setup, waitFor } from "./helpers";

describe("Badge and StatusBadge", () => {
  test("badge is a squared micro-label", () => {
    setup(<Badge variant="clay">Clay</Badge>);
    const badge = screen.getByText("Clay").className;
    expect(badge).toContain("rounded-xs");
    expect(badge).toContain("px-[7px]");
  });

  test("a status always has a word and a mark", () => {
    const { container } = setup(<StatusBadge status="danger">Overdue by 6h</StatusBadge>);
    expect(screen.getByText("Overdue by 6h")).toBeTruthy();
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });

  test("a status is a pill with a word and a mark, not a squared label with a left rule", () => {
    setup(<StatusBadge status="danger">Overdue</StatusBadge>);
    const pill = screen.getByText("Overdue");
    expect(pill.className).toContain("rounded-full");
    expect(pill.className).toContain("px-2.5");
    expect(pill.className).not.toContain("rounded-xs");
    expect(pill.className).not.toContain("px-[7px]");
    expect(pill.className).not.toContain("inset_3px");
    expect(pill.querySelector("svg")).toBeTruthy();
  });

  test("a steady status in a dense table can use a dot instead of an icon", () => {
    setup(
      <StatusBadge status="positive" dot>
        Active
      </StatusBadge>,
    );
    const pill = screen.getByText("Active");
    expect(pill.querySelector("svg")).toBeNull();
    expect(pill.className).toContain("rounded-full");
    expect(pill.className).toContain("px-2.5");
    expect(pill.className).not.toContain("rounded-xs");
    expect(pill.className).not.toContain("px-[7px]");
  });

  test("the dot form still carries the word", () => {
    const { container } = setup(
      <StatusBadge status="positive" dot>
        Healthy
      </StatusBadge>,
    );
    expect(screen.getByText("Healthy")).toBeTruthy();
    expect(container.querySelector("svg")).toBeNull();
  });
});

describe("Banner and states", () => {
  test("danger banners are alerts, the others a status", () => {
    setup(
      <>
        <Banner status="danger" title="Google disconnected" />
        <Banner status="warning" title="Due in 3h" />
      </>,
    );
    expect(screen.getByRole("alert").textContent).toContain("Google disconnected");
    expect(screen.getByRole("status").textContent).toContain("Due in 3h");
  });

  test("ErrorState offers a retry and calls it", async () => {
    const onRetry = mock();
    const { user } = setup(<ErrorState onRetry={onRetry}>Your reviews are safe.</ErrorState>);
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalled();
  });

  test("EmptyState says what will appear", () => {
    setup(
      <EmptyState title="Nothing needs follow-up right now." action={<Button>See resolved</Button>}>
        New cases appear here.
      </EmptyState>,
    );
    expect(screen.getByRole("heading", { name: /Nothing needs follow-up/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "See resolved" })).toBeTruthy();
  });

  test("Spinner is announced as loading", () => {
    setup(<Spinner />);
    expect(screen.getByRole("status").textContent).toContain("Loading");
  });
});

describe("Dialog", () => {
  test("opens from its trigger, names itself, and closes with Escape", async () => {
    const { user } = setup(
      <Dialog
        trigger={<Button>Open</Button>}
        title="Delete this reply?"
        description="Nothing changes on Google."
        actions={<Button>Delete reply</Button>}
      />,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Open" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.getAttribute("aria-labelledby")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Delete this reply?" })).toBeTruthy();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  test("ConfirmDialog runs the action only on confirm", async () => {
    const onConfirm = mock();
    const { user } = setup(
      <ConfirmDialog
        trigger={<Button>Delete</Button>}
        title="Delete?"
        description="Gone."
        confirmLabel="Delete reply"
        onConfirm={onConfirm}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(await screen.findByRole("button", { name: "Keep it" }));
    expect(onConfirm).not.toHaveBeenCalled();
    await user.click(await screen.findByRole("button", { name: "Delete" }));
    await user.click(await screen.findByRole("button", { name: "Delete reply" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  test("Drawer opens a named panel", async () => {
    const { user } = setup(
      <Drawer trigger={<Button>Case</Button>} title="Casa Olivo">
        Body
      </Drawer>,
    );
    await user.click(screen.getByRole("button", { name: "Case" }));
    expect(await screen.findByText("Body")).toBeTruthy();
    expect(screen.getByText("Casa Olivo")).toBeTruthy();
  });
});

describe("Menu, Popover, Tooltip", () => {
  test("menu runs the chosen item", async () => {
    const onSelect = mock();
    const { user } = setup(
      <Menu
        trigger={<Button>Actions</Button>}
        items={[{ label: "Edit reply", onSelect }, "separator", { label: "Delete", danger: true }]}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Edit reply" }));
    expect(onSelect).toHaveBeenCalled();
  });

  test("menu puts the destructive item in clay", async () => {
    const { user } = setup(
      <Menu trigger={<Button>Actions</Button>} items={[{ label: "Delete", danger: true }]} />,
    );
    await user.click(screen.getByRole("button", { name: "Actions" }));
    expect((await screen.findByRole("menuitem", { name: "Delete" })).className).toContain(
      "text-clay-600",
    );
  });

  test("popover shows its content from the trigger", async () => {
    const { user } = setup(
      <Popover trigger={<Button>Filters</Button>} title="Filters">
        Status
      </Popover>,
    );
    await user.click(screen.getByRole("button", { name: "Filters" }));
    expect(await screen.findByText("Status")).toBeTruthy();
  });

  test("tooltip names the control on focus", async () => {
    const { user } = setup(
      <Tooltip label="Copy link">
        <Button>Copy</Button>
      </Tooltip>,
    );
    await user.tab();
    expect(await screen.findByText("Copy link")).toBeTruthy();
  });
});

describe("Toast", () => {
  function Demo() {
    const toast = useToast();
    return (
      <Button
        onClick={() =>
          toast.show({
            title: "Case marked as contacted",
            action: { label: "Undo", onClick: () => undefined },
          })
        }
      >
        Mark
      </Button>
    );
  }

  test("shows a toast with an undo action and lets it be dismissed", async () => {
    const { user } = setup(
      <ToastProvider>
        <Demo />
      </ToastProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Mark" }));
    expect(await screen.findByText("Case marked as contacted")).toBeTruthy();
    expect(await screen.findByRole("button", { name: "Undo" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    await waitFor(() => expect(screen.queryByText("Case marked as contacted")).toBeNull());
  });
});
