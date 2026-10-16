import { describe, expect, mock, test } from "bun:test";
import { Plus } from "lucide-react";
import {
  Button,
  Chip,
  ChipGroup,
  ChipToggle,
  Emphasis,
  Eyebrow,
  Highlight,
  Icon,
  IconButton,
  Rule,
  StatFigure,
  Wordmark,
} from "../src";
import { screen, setup } from "./helpers";

describe("brand", () => {
  test("Wordmark reads as the full name to assistive technology", () => {
    setup(<Wordmark />);
    expect(screen.getByText("Atrium")).toBeTruthy();
    expect(screen.getByText("AD", { selector: ".sr-only" })).toBeTruthy();
  });

  test("Eyebrow draws its leading rule unless told not to", () => {
    const { container, rerender } = setup(<Eyebrow>Case study</Eyebrow>);
    expect(container.firstElementChild?.className).toContain("before:w-7");
    rerender(<Eyebrow rule={false}>Case study</Eyebrow>);
    expect(container.firstElementChild?.className).not.toContain("before:w-7");
  });

  test("Rule is a separator and carries a label on both sides", () => {
    const { container } = setup(<Rule label="Section" />);
    expect(screen.getByRole("separator")).toBeTruthy();
    expect(container.querySelectorAll("span.flex-1")).toHaveLength(2);
  });

  test("StatFigure sets the figure in the serif", () => {
    setup(<StatFigure value="2.7x" label="Return on ad spend" />);
    expect(screen.getByText("2.7x").className).toContain("font-serif");
    expect(screen.getByText("Return on ad spend")).toBeTruthy();
  });

  test("Emphasis and Highlight are inline devices", () => {
    setup(
      <p>
        We <Emphasis>agree</Emphasis> the <Highlight>number</Highlight>
      </p>,
    );
    expect(screen.getByText("agree").tagName).toBe("EM");
    expect(screen.getByText("number").className).toContain("bg-size");
  });

  test("Icon is hidden unless it has a label", () => {
    const { container } = setup(
      <>
        <Icon icon={Plus} />
        <Icon icon={Plus} label="Add" />
      </>,
    );
    const [a, b] = Array.from(container.querySelectorAll("svg"));
    expect(a?.getAttribute("aria-hidden")).toBe("true");
    expect(b?.getAttribute("aria-label")).toBe("Add");
  });
});

describe("Button", () => {
  test("renders a native button and fires onClick", async () => {
    const onClick = mock();
    const { user } = setup(<Button onClick={onClick}>Save client</Button>);
    await user.click(screen.getByRole("button", { name: "Save client" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  test("variants map to the system: primary is charcoal, lime is the signal, clay is clay-600", () => {
    setup(
      <>
        <Button>P</Button>
        <Button variant="lime">L</Button>
        <Button variant="clay">C</Button>
      </>,
    );
    expect(screen.getByText("P").className).toContain("bg-charcoal-800");
    expect(screen.getByText("L").className).toContain("bg-lime-500");
    expect(screen.getByText("C").className).toContain("bg-clay-600");
  });

  test("is squared: never a pill", () => {
    setup(<Button>Go</Button>);
    expect(screen.getByRole("button").className).toContain("rounded-control");
    expect(screen.getByRole("button").className).not.toContain("rounded-full");
  });

  test("disabled does not fire", async () => {
    const onClick = mock();
    const { user } = setup(
      <Button disabled onClick={onClick}>
        No
      </Button>,
    );
    await user.click(screen.getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
  });

  test("loading disables, marks busy and keeps the label", async () => {
    const onClick = mock();
    const { user } = setup(
      <Button loading onClick={onClick}>
        Saving
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Saving" });
    expect(button.getAttribute("aria-busy")).toBe("true");
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  test("can render as a link", () => {
    setup(
      <Button render={<a href="/cases" />} nativeButton={false}>
        Cases
      </Button>,
    );
    // Base UI keeps role="button" on a non-native button so it stays operable with Space as well as Enter.
    const el = screen.getByText("Cases");
    expect(el.tagName).toBe("A");
    expect(el.getAttribute("href")).toBe("/cases");
  });

  test("IconButton is named by its label", () => {
    setup(<IconButton label="Search" icon={<Plus />} />);
    expect(screen.getByRole("button", { name: "Search" })).toBeTruthy();
  });
});

describe("Chip", () => {
  test("is a pill, and only a chip is", () => {
    setup(<Chip>Lime</Chip>);
    expect(screen.getByText("Lime").className).toContain("rounded-full");
  });

  test("can be removed", async () => {
    const onRemove = mock();
    const { user } = setup(<Chip onRemove={onRemove}>Houston</Chip>);
    await user.click(screen.getByRole("button", { name: "Remove" }));
    expect(onRemove).toHaveBeenCalled();
  });

  test("ChipToggle exposes its pressed state", async () => {
    const { user } = setup(<ChipToggle>SEO</ChipToggle>);
    const toggle = screen.getByRole("button", { name: "SEO" });
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    await user.click(toggle);
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
  });

  test("ChipGroup keeps one value at a time", async () => {
    const { user } = setup(
      <ChipGroup
        defaultValue={["a"]}
        options={[
          { value: "a", label: "Active" },
          { value: "b", label: "Open" },
        ]}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Open" }));
    expect(screen.getByRole("button", { name: "Open" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Active" }).getAttribute("aria-pressed")).toBe(
      "false",
    );
  });
});
