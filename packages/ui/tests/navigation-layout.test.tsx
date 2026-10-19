import { describe, expect, mock, test } from "bun:test";
import {
  AppShell,
  Breadcrumbs,
  Container,
  Grid,
  Inline,
  Link,
  PageHeader,
  Pagination,
  Section,
  Segmented,
  SideNav,
  Stack,
  Stepper,
  Tabs,
  TopBar,
} from "../src";
import { screen, setup, within } from "./helpers";

const items = [
  { value: "active", label: "Active", count: 4 },
  { value: "open", label: "Open", count: 3 },
  { value: "done", label: "Resolved", count: 0 },
];

describe("Tabs", () => {
  test("is a tablist whose selected tab is announced, and arrow keys move", async () => {
    const { user } = setup(<Tabs label="Status" defaultValue="active" items={items} />);
    expect(screen.getByRole("tablist", { name: "Status" })).toBeTruthy();
    const active = screen.getByRole("tab", { name: /Active/ });
    expect(active.getAttribute("aria-selected")).toBe("true");
    await user.click(screen.getByRole("tab", { name: /Open/ }));
    expect(screen.getByRole("tab", { name: /Open/ }).getAttribute("aria-selected")).toBe("true");
    expect(active.getAttribute("aria-selected")).toBe("false");
  });

  test("chip tabs are pills; underline tabs are not", () => {
    const { rerender } = setup(<Tabs label="S" defaultValue="active" items={items} />);
    expect(screen.getAllByRole("tab")[0]?.className).toContain("rounded-full");
    rerender(<Tabs label="S" variant="underline" defaultValue="active" items={items} />);
    expect(screen.getAllByRole("tab")[0]?.className).not.toContain("rounded-full");
  });

  test("shows the panel of the selected tab", async () => {
    const { user } = setup(
      <Tabs
        label="Sections"
        variant="underline"
        defaultValue="a"
        items={[
          { value: "a", label: "Overview", content: "Overview body" },
          { value: "b", label: "Reviews", content: "Reviews body" },
        ]}
      />,
    );
    expect(screen.getByRole("tabpanel").textContent).toContain("Overview body");
    await user.click(screen.getByRole("tab", { name: "Reviews" }));
    expect(screen.getByRole("tabpanel").textContent).toContain("Reviews body");
  });

  test("segmented control reports the chosen option", async () => {
    const onValueChange = mock();
    const { user } = setup(
      <Segmented
        label="Range"
        defaultValue={["30d"]}
        onValueChange={onValueChange}
        options={[
          { value: "7d", label: "7 days" },
          { value: "30d", label: "30 days" },
        ]}
      />,
    );
    await user.click(screen.getByRole("button", { name: "7 days" }));
    expect(onValueChange).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "7 days" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
  });
});

describe("Breadcrumbs, Link, Pagination, Stepper", () => {
  test("the last crumb is the current page and not a link", () => {
    setup(
      <Breadcrumbs
        items={[
          { label: "Clients", href: "/clients" },
          { label: "Casa Olivo", href: "/clients/a" },
          { label: "Reviews" },
        ]}
      />,
    );
    expect(screen.getAllByRole("link")).toHaveLength(2);
    expect(screen.getByText("Reviews").getAttribute("aria-current")).toBe("page");
  });

  test("Link underlines and goes clay on hover", () => {
    setup(<Link href="/x">Read the case</Link>);
    const cls = screen.getByRole("link").className;
    expect(cls).toContain("underline");
    expect(cls).toContain("hover:text-clay-600");
  });

  test("pagination marks the current page, pages through, and disables the ends", async () => {
    const onPageChange = mock();
    const { user, rerender } = setup(<Pagination page={1} pages={5} onPageChange={onPageChange} />);
    expect(
      (screen.getByRole("button", { name: "Previous page" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(screen.getByRole("button", { name: "Page 1" }).getAttribute("aria-current")).toBe(
      "page",
    );
    await user.click(screen.getByRole("button", { name: "Next page" }));
    expect(onPageChange).toHaveBeenCalledWith(2);
    rerender(<Pagination page={5} pages={5} onPageChange={onPageChange} />);
    expect((screen.getByRole("button", { name: "Next page" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  test("pagination elides long runs", () => {
    setup(<Pagination page={10} pages={20} onPageChange={() => undefined} />);
    expect(screen.queryByRole("button", { name: "Page 5" })).toBeNull();
    expect(screen.getByRole("button", { name: "Page 20" })).toBeTruthy();
  });

  test("stepper marks the current step", () => {
    setup(
      <Stepper
        current={1}
        steps={[{ label: "Connect Toast" }, { label: "Pick locations" }, { label: "Review" }]}
      />,
    );
    expect(screen.getAllByRole("listitem").map((li) => li.getAttribute("aria-current"))).toEqual([
      null,
      "step",
      null,
    ]);
  });
});

describe("SideNav, TopBar, AppShell", () => {
  const groups = [
    {
      items: [
        { id: "portfolio", label: "Portfolio", href: "/" },
        { id: "cases", label: "Cases", href: "/cases", count: 3 },
      ],
    },
  ];

  test("marks the current page and shows the count", () => {
    setup(<SideNav brand="ATRIUM" groups={groups} current="cases" />);
    expect(screen.getByRole("link", { name: /Cases/ }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Portfolio" }).getAttribute("aria-current")).toBeNull();
    expect(within(screen.getByRole("link", { name: /Cases/ })).getByText("3")).toBeTruthy();
  });

  test("uses the router link it is given", () => {
    const RouterLink = ({
      href,
      children,
      ...rest
    }: {
      href: string;
      children?: React.ReactNode;
    }) => (
      <a data-router="yes" href={href} {...rest}>
        {children}
      </a>
    );
    setup(<SideNav brand="x" groups={groups} current="portfolio" linkAs={RouterLink} />);
    expect(screen.getByRole("link", { name: "Portfolio" }).getAttribute("data-router")).toBe("yes");
  });

  const nested = [
    {
      items: [
        { id: "overview", label: "Overview", href: "/" },
        {
          id: "reputation",
          label: "Reputation",
          href: "/reputation/cases",
          count: 2,
          children: [
            { id: "cases", label: "Cases", href: "/reputation/cases" },
            { id: "responses", label: "Responses", href: "/reputation/responses" },
          ],
        },
        { id: "growth", label: "Growth", href: "/modules/growth", locked: true },
      ],
    },
  ];

  test("a parent is collapsed until a child is current, then it opens by itself", () => {
    const { rerender } = setup(<SideNav brand="x" groups={nested} current="overview" />);
    const toggle = screen.getByRole("button", { name: /Reputation/ });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("link", { name: "Cases" })).toBeNull();
    rerender(<SideNav brand="x" groups={nested} current="responses" />);
    expect(screen.getByRole("button", { name: /Reputation/ }).getAttribute("aria-expanded")).toBe(
      "true",
    );
    expect(screen.getByRole("link", { name: "Responses" }).getAttribute("aria-current")).toBe(
      "page",
    );
    expect(screen.getByRole("link", { name: "Cases" }).getAttribute("aria-current")).toBeNull();
  });

  test("clicking a parent toggles its children and keeps the count visible", async () => {
    const { user } = setup(<SideNav brand="x" groups={nested} current="overview" />);
    const toggle = screen.getByRole("button", { name: /Reputation/ });
    expect(within(toggle).getByText("2")).toBeTruthy();
    await user.click(toggle);
    expect(screen.getByRole("link", { name: "Cases" })).toBeTruthy();
    await user.click(toggle);
    expect(screen.queryByRole("link", { name: "Cases" })).toBeNull();
  });

  test("a locked item stays a link to its teaser and says it is locked", () => {
    setup(<SideNav brand="x" groups={nested} current="overview" />);
    const link = screen.getByRole("link", { name: /Growth/ });
    expect(link.getAttribute("href")).toBe("/modules/growth");
    expect(link.getAttribute("data-locked")).toBe("true");
    expect(within(link).getByLabelText("Locked")).toBeTruthy();
  });

  test("AppShell has a main landmark and the navigation", () => {
    setup(
      <AppShell
        nav={<SideNav brand="x" groups={groups} current="cases" />}
        topBar={<TopBar>Search</TopBar>}
      >
        Work
      </AppShell>,
    );
    expect(screen.getByRole("main").textContent).toBe("Work");
    expect(screen.getByRole("navigation", { name: "Main" })).toBeTruthy();
    expect(screen.getByRole("banner")).toBeTruthy();
  });
});

describe("layout", () => {
  test("PageHeader gives the page its h1", () => {
    setup(
      <PageHeader
        eyebrow="Reputation"
        title="Recovery cases"
        description="Reach out within 24 hours."
        actions={<button type="button">Export</button>}
      />,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Recovery cases" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Export" })).toBeTruthy();
    // Prose keeps a readable measure even when the page is full width.
    expect(screen.getByText("Reach out within 24 hours.").className).toContain("max-w-[68ch]");
  });

  test("Section sits under the 3px rule and has an h2", () => {
    setup(
      <Section title="Results" label="02 — Results">
        Body
      </Section>,
    );
    expect(screen.getByRole("heading", { level: 2, name: "Results" })).toBeTruthy();
    expect(screen.getByRole("separator")).toBeTruthy();
  });

  test("Container stops at 1240 and 1440 wide", () => {
    const { container } = setup(
      <>
        <Container>a</Container>
        <Container wide>b</Container>
      </>,
    );
    expect(container.children[0]?.className).toContain("max-w-[1240px]");
    expect(container.children[1]?.className).toContain("max-w-[1440px]");
  });

  test("Stack, Inline and Grid use the 4px grid", () => {
    const { container } = setup(
      <>
        <Stack gap={6}>a</Stack>
        <Inline gap={2}>b</Inline>
        <Grid min={200}>c</Grid>
      </>,
    );
    expect(container.children[0]?.className).toContain("gap-6");
    expect(container.children[1]?.className).toContain("flex-wrap");
    expect((container.children[2] as HTMLElement).style.gridTemplateColumns).toContain("minmax");
  });
});
