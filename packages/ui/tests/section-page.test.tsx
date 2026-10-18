import { describe, expect, mock, test } from "bun:test";
import {
  DataSectionPage,
  SectionBand,
  SentimentPill,
  SeverityPill,
  Stars,
  TopicChips,
  When,
} from "../src";
import { screen, setup, within } from "./helpers";

describe("Stars", () => {
  test("two of five is text with a label", () => {
    setup(<Stars rating={2} />);
    const el = screen.getByLabelText("2 of 5");
    expect(el.textContent).toBe("★★☆☆☆");
  });
  test("ratings clamp to 1 to 5", () => {
    setup(
      <>
        <Stars rating={0} />
        <Stars rating={9} />
      </>,
    );
    expect(screen.getByLabelText("1 of 5").textContent).toBe("★☆☆☆☆");
    expect(screen.getByLabelText("5 of 5").textContent).toBe("★★★★★");
  });
});

describe("TopicChips", () => {
  test("shows two chips and the rest as a count", () => {
    setup(<TopicChips topics={["food", "wait-time", "staff"]} />);
    expect(screen.getByText("Food")).toBeTruthy();
    expect(screen.getByText("Wait time")).toBeTruthy();
    expect(screen.queryByText("Staff")).toBeNull();
    expect(screen.getByText("+1")).toBeTruthy();
  });
  test("null and empty are a dash", () => {
    const { unmount } = setup(<TopicChips topics={null} />);
    expect(screen.getByText("—")).toBeTruthy();
    unmount();
    setup(<TopicChips topics={[]} />);
    expect(screen.getByText("—")).toBeTruthy();
  });
});

describe("When", () => {
  test("a short date and time, with the relative form in the title", () => {
    const now = new Date(2026, 9, 18, 12, 0);
    const date = new Date(2026, 9, 18, 9, 40).toISOString();
    setup(<When date={date} now={now} />);
    const el = screen.getByText("Oct 18, 9:40");
    expect(el.getAttribute("title")).toBe("2 hours ago");
  });
});

describe("pills", () => {
  test("severity and sentiment always carry a word", () => {
    setup(
      <>
        <SeverityPill severity="high" />
        <SeverityPill severity="medium" />
        <SeverityPill severity="low" />
        <SentimentPill sentiment="positive" />
        <SentimentPill sentiment="mixed" />
        <SentimentPill sentiment="negative" />
        <SentimentPill sentiment={null} />
      </>,
    );
    for (const w of ["High", "Medium", "Low", "Positive", "Mixed", "Negative", "—"]) {
      expect(screen.getByText(w)).toBeTruthy();
    }
    expect(screen.getByText("High").closest("span")?.className).toContain("clay");
  });
});

describe("SectionBand", () => {
  const base = { onRetry: () => {}, title: "Summary", tiles: <p>tiles here</p> };
  test("shows a skeleton while loading", () => {
    setup(<SectionBand {...base} state="loading" />);
    expect(screen.getByRole("status", { name: /loading/i })).toBeTruthy();
    expect(screen.queryByText("tiles here")).toBeNull();
  });
  test("shows the tiles when ok, with the band min-height", () => {
    setup(<SectionBand {...base} state="ok" aside={<p>aside here</p>} />);
    expect(screen.getByText("tiles here")).toBeTruthy();
    expect(screen.getByText("aside here")).toBeTruthy();
    expect(screen.getByRole("region", { name: "Summary" }).className).toContain(
      "lg:min-h-[clamp(14rem,30vh,20rem)]",
    );
  });
  test("an error offers Retry and the table slot still renders", async () => {
    const onRetry = mock();
    const { user } = setup(
      <DataSectionPage
        title="Cases"
        band={<SectionBand {...base} state="error" onRetry={onRetry} />}
      >
        <p>the table</p>
      </DataSectionPage>,
    );
    expect(screen.getByText("Could not load the summary")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(screen.getByText("the table")).toBeTruthy();
  });
});

describe("DataSectionPage", () => {
  test("renders the header, controls, band, tabs, children and the filter note once", () => {
    setup(
      <DataSectionPage
        title="Responses"
        description="What guests said"
        controls={<button type="button">ctl</button>}
        band={<p>band</p>}
        tabs={<p>tabs</p>}
      >
        <p>children</p>
      </DataSectionPage>,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Responses" })).toBeTruthy();
    expect(
      screen.getAllByText("Filters apply to the table; the summary follows the range and place."),
    ).toHaveLength(1);
    for (const t of ["ctl", "band", "tabs", "children"]) expect(screen.getByText(t)).toBeTruthy();
    expect(within(document.body).getByText("What guests said")).toBeTruthy();
  });
});
