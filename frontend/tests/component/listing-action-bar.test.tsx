// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

import { ListingActionBar } from "@/components/seller/ListingActionBar";

const props = {
  vehicleId: "v-audi",
  listingId: "l-audi",
  vehicleLabel: "Audi A4",
  onAddPhotos: vi.fn(),
  onSetPrice: vi.fn(),
  onWriteDescription: vi.fn(),
};

describe("Seller Listing Features action bar (all 8 actions)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Vitest does not enable RTL's automatic cleanup unless globals are on.
    // Without this, DOM accumulates across tests and getByRole finds duplicates.
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("renders every required action with a real handler", () => {
    render(<ListingActionBar {...props} />);
    for (const label of [
      "Add Photos", "Upload Documents", "Set Price", "Write Description",
      "Preview Listing", "Share Listing", "Track Inquiries", "Get Verification Report",
    ]) {
      expect(screen.getByRole("button", { name: new RegExp(label, "i") })).toBeTruthy();
    }
  });

  it("focuses the real workspace callbacks instead of faking success", () => {
    render(<ListingActionBar {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /Add Photos/i }));
    fireEvent.click(screen.getByRole("button", { name: /Set Price/i }));
    fireEvent.click(screen.getByRole("button", { name: /Write Description/i }));
    expect(props.onAddPhotos).toHaveBeenCalledTimes(1);
    expect(props.onSetPrice).toHaveBeenCalledTimes(1);
    expect(props.onWriteDescription).toHaveBeenCalledTimes(1);
  });

  it("navigates to DB-backed screens for documents and inquiries", () => {
    render(<ListingActionBar {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /Upload Documents/i }));
    fireEvent.click(screen.getByRole("button", { name: /Track Inquiries/i }));
    expect(push).toHaveBeenCalledWith("/seller/documents?vehicle=v-audi");
    expect(push).toHaveBeenCalledWith("/seller/inquiries?listing=l-audi");
  });

  it("shows a real error state when share-link creation fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: { message: "Share links are unavailable." } }),
    }));
    render(<ListingActionBar {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /Share Listing/i }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("unavailable"));
    // No fake success panel is shown.
    expect(screen.queryByText(/Share link created/i)).toBeNull();
  });

  it("shows the generated report and a real download link on success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { id: "r-1", reportId: "TD-REPORT-1" } }),
    }));
    render(<ListingActionBar {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /Get Verification Report/i }));
    await waitFor(() => expect(screen.getByText(/TD-REPORT-1/)).toBeTruthy());
    expect(screen.getByRole("link", { name: /Download PDF/i }).getAttribute("href"))
      .toBe("/api/v1/reports/r-1/download");
  });
});
