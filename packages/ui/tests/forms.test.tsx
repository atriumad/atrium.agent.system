import { describe, expect, mock, test } from "bun:test";
import {
  Checkbox,
  CheckboxGroup,
  DateRangeField,
  Field,
  FileDrop,
  Input,
  NumberField,
  Radio,
  RadioGroup,
  SearchInput,
  Select,
  Switch,
  TextareaField,
  TextField,
} from "../src";
import { fireEvent, screen, setup, waitFor } from "./helpers";

describe("Field and TextField", () => {
  test("the label names the input", () => {
    setup(<TextField label="Work email" />);
    expect(screen.getByLabelText("Work email")).toBeTruthy();
  });

  test("a hint is tied to the control", () => {
    setup(<TextField label="Email" hint="We reply in two days." />);
    const input = screen.getByLabelText("Email");
    const hint = screen.getByText("We reply in two days.");
    expect(input.getAttribute("aria-describedby")).toContain(hint.id);
  });

  test("an error replaces the hint, is announced and marks the control invalid", () => {
    setup(
      <TextField label="Budget" hint="A range." error="Tell us a range so we can be useful." />,
    );
    expect(screen.queryByText("A range.")).toBeNull();
    expect(screen.getByRole("alert").textContent).toContain("Tell us a range");
    expect(screen.getByLabelText("Budget").getAttribute("aria-invalid")).toBe("true");
  });

  test("optional fields say so", () => {
    setup(<TextField label="Phone" optional />);
    expect(screen.getByText("(optional)")).toBeTruthy();
  });

  test("typing reaches onChange", async () => {
    const onChange = mock();
    const { user } = setup(<TextField label="Name" onChange={onChange} />);
    await user.type(screen.getByLabelText("Name"), "Ana");
    expect(onChange).toHaveBeenCalled();
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Ana");
  });

  test("is squared with the field edge, never the cream hairline", () => {
    setup(
      <Field label="X">
        <Input />
      </Field>,
    );
    const cls = screen.getByRole("textbox").className;
    expect(cls).toContain("rounded-sm");
    expect(cls).toContain("border-field");
  });

  test("textarea and search keep their names", () => {
    setup(
      <>
        <TextareaField label="Notes" />
        <SearchInput label="Search clients" />
      </>,
    );
    expect(screen.getByLabelText("Notes").tagName).toBe("TEXTAREA");
    expect(screen.getByRole("searchbox", { name: "Search clients" })).toBeTruthy();
  });
});

describe("Checkbox, Radio, Switch", () => {
  test("checkbox toggles and reports", async () => {
    const onCheckedChange = mock();
    const { user } = setup(<Checkbox label="I have consent" onCheckedChange={onCheckedChange} />);
    const box = screen.getByRole("checkbox", { name: "I have consent" });
    expect(box.getAttribute("aria-checked")).toBe("false");
    await user.click(box);
    expect(box.getAttribute("aria-checked")).toBe("true");
    expect(onCheckedChange).toHaveBeenCalled();
  });

  test("a disabled checkbox cannot be toggled", async () => {
    const { user } = setup(<Checkbox label="Not available" disabled />);
    const box = screen.getByRole("checkbox");
    await user.click(box);
    expect(box.getAttribute("aria-checked")).toBe("false");
  });

  test("checkbox group holds several values", async () => {
    const { user } = setup(
      <CheckboxGroup defaultValue={["a"]}>
        <Checkbox label="A" value="a" />
        <Checkbox label="B" value="b" />
      </CheckboxGroup>,
    );
    await user.click(screen.getByRole("checkbox", { name: "B" }));
    expect(screen.getByRole("checkbox", { name: "A" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("checkbox", { name: "B" }).getAttribute("aria-checked")).toBe("true");
  });

  test("radio group picks one", async () => {
    const { user } = setup(
      <RadioGroup defaultValue="email" aria-label="Channel">
        <Radio label="Email" value="email" />
        <Radio label="SMS" value="sms" />
      </RadioGroup>,
    );
    await user.click(screen.getByRole("radio", { name: "SMS" }));
    expect(screen.getByRole("radio", { name: "SMS" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("radio", { name: "Email" }).getAttribute("aria-checked")).toBe("false");
  });

  test("switch is a switch and flips", async () => {
    const { user } = setup(<Switch label="Weekly summary" />);
    const sw = screen.getByRole("switch", { name: "Weekly summary" });
    expect(sw.getAttribute("aria-checked")).toBe("false");
    await user.click(sw);
    expect(sw.getAttribute("aria-checked")).toBe("true");
  });

  test("switch thumb is centred by its root and follows the state", async () => {
    // jsdom computes no layout, so this pins the centring classes, not pixels.
    const { user } = setup(<Switch label="Weekly summary" />);
    const sw = screen.getByRole("switch", { name: "Weekly summary" });
    expect(sw.className).toContain("inline-flex");
    expect(sw.className).toContain("items-center");
    const thumb = sw.firstElementChild as HTMLElement;
    expect(thumb.hasAttribute("data-checked")).toBe(false);
    await user.click(sw);
    expect(thumb.hasAttribute("data-checked")).toBe(true);
    await user.click(sw);
    expect(thumb.hasAttribute("data-checked")).toBe(false);
  });
});

describe("Select", () => {
  test("opens a listbox and chooses", async () => {
    const onValueChange = mock();
    const { user } = setup(
      <Field label="Package">
        <Select
          options={[
            { value: "e", label: "Essential" },
            { value: "p", label: "Pillar 1" },
          ]}
          onValueChange={onValueChange}
        />
      </Field>,
    );
    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "Pillar 1" }));
    await waitFor(() => expect(onValueChange).toHaveBeenCalled());
    expect(onValueChange.mock.calls[0]?.[0]).toBe("p");
  });
});

describe("NumberField", () => {
  test("steps up and down by its buttons", async () => {
    const { user } = setup(<NumberField label="Covers" defaultValue={2} />);
    await user.click(screen.getByRole("button", { name: "Increase Covers" }));
    expect((screen.getByLabelText("Covers") as HTMLInputElement).value).toBe("3");
    await user.click(screen.getByRole("button", { name: "Decrease Covers" }));
    expect((screen.getByLabelText("Covers") as HTMLInputElement).value).toBe("2");
  });
});

describe("DateRangeField", () => {
  test("refuses a range that ends before it starts", () => {
    setup(<DateRangeField defaultValue={{ from: "2026-10-10", to: "2026-10-01" }} />);
    expect(screen.getByRole("alert").textContent).toContain("before the start");
  });

  test("a preset fills both dates", async () => {
    const onChange = mock();
    const { user } = setup(<DateRangeField onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "Last 7 days" }));
    const last = onChange.mock.calls.at(-1)?.[0] as { from: string; to: string };
    expect(last.from < last.to).toBe(true);
  });
});

describe("FileDrop", () => {
  test("takes a dropped file and lists it, and refuses a big one", async () => {
    const onFiles = mock();
    setup(<FileDrop label="Toast export" maxSize={10} onFiles={onFiles} />);
    const input = screen.getByLabelText("Toast export") as HTMLInputElement;
    const small = new File(["abc"], "orders.csv", { type: "text/csv" });
    fireEvent.change(input, { target: { files: [small] } });
    expect(await screen.findByText(/orders\.csv/)).toBeTruthy();
    const big = new File(["x".repeat(50)], "huge.csv");
    fireEvent.change(input, { target: { files: [big] } });
    expect((await screen.findByRole("alert")).textContent).toContain("huge.csv");
  });
});
