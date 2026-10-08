import { describe, expect, test } from "bun:test";
import { FormCard } from "../src/surveys-app";
import { screen, setup } from "./helpers";

const form = {
  locationId: "11111111-1111-4111-8111-111111111111",
  locationName: "Bellaire",
  clientId: "c",
  clientName: "Casa Olivo",
  reviewUrl: "https://g.page/r/abc/review",
  requestDelayMinutes: 120,
  qrVersion: 1,
  status: "active" as const,
  qrPath: "/q/x",
  qrUrl: "http://hub.test/q/x",
};

describe("FormCard capabilities", () => {
  test("an owner can generate a link but not rotate the QR or edit the review link", () => {
    setup(<FormCard form={form} onChanged={() => {}} canManage={false} canOperate />);
    expect(screen.getByText("Generate link")).toBeTruthy();
    expect(screen.queryByText("Rotate QR")).toBeNull();
    expect((screen.getByLabelText(/Google review link/i) as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText(/Help tab/i)).toBeTruthy();
  });

  test("the agency sees every control", () => {
    setup(<FormCard form={form} onChanged={() => {}} canManage canOperate />);
    expect(screen.getByText("Rotate QR")).toBeTruthy();
    expect((screen.getByLabelText(/Google review link/i) as HTMLInputElement).disabled).toBe(false);
  });
});
