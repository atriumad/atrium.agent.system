import { describe, expect, mock, test } from "bun:test";
import { PlacesPanel } from "../src/places-panel";
import { screen, setup, waitFor } from "./helpers";

const places = [
  { id: "1", name: "Bellaire", clientId: "c", clientName: "Olivo", status: "active" as const },
  { id: "2", name: "Heights", clientId: "c", clientName: "Olivo", status: "pending" as const },
];

describe("PlacesPanel", () => {
  test("shows each place with its status", async () => {
    const client = { places: async () => places, requestPlace: mock(async () => ({ id: "3" })) };
    setup(<PlacesPanel client={client} />);
    expect(await screen.findByText("Bellaire")).toBeTruthy();
    expect(screen.getByText("Active")).toBeTruthy();
    expect(screen.getByText("Waiting for approval")).toBeTruthy();
  });

  test("asking for a place sends the name and the time zone", async () => {
    const requestPlace = mock(async (_n: string, _tz: string) => ({ id: "3" }));
    const client = { places: async () => places, requestPlace };
    const { user } = setup(<PlacesPanel client={client} />);
    await screen.findByText("Bellaire");
    await user.type(screen.getByLabelText("Name of the place"), "Patio");
    await user.clear(screen.getByLabelText("Time zone"));
    await user.type(screen.getByLabelText("Time zone"), "America/Chicago");
    await user.click(screen.getByText("Ask for this place"));
    await waitFor(() => expect(requestPlace).toHaveBeenCalledWith("Patio", "America/Chicago"));
    expect(await screen.findByText(/sent to the Atrium team/i)).toBeTruthy();
  });

  test("the name is required", async () => {
    const requestPlace = mock(async () => ({ id: "3" }));
    const { user } = setup(<PlacesPanel client={{ places: async () => places, requestPlace }} />);
    await screen.findByText("Bellaire");
    await user.click(screen.getByText("Ask for this place"));
    expect(await screen.findByText(/Give the place a name/i)).toBeTruthy();
    expect(requestPlace).not.toHaveBeenCalled();
  });
});
