import { describe, it, expect, beforeAll } from "vitest";
import { getDb, createListingImage, updateDocument, updateFinding, getFindings } from "../lib/server/db";
import {
  createVehicleDraft,
  updateVehicleForOwner,
  addDocumentForVehicle,
  addHistoryForVehicle,
  addMileageForVehicle,
  addDamageForVehicle,
  startVerificationRun,
  createListingForVehicle,
  transitionListingForActor,
  getMarketplace,
  getVehicleDetail,
  getCompareVehicles,
  createInquiryForBuyer,
  sendInquiryMessage,
  saveListingForBuyer,
  unsaveListingForBuyer,
  getInquiryThread,
  getInquiriesForSeller,
  archiveVehicleForOwner,
} from "../lib/server/data";

describe("Complete Seller to Buyer Cross-Role Workflow", () => {
  const sellerId = "u-seller";
  const buyerId = "u-buyer";
  const testReg = `DL01AB${Math.floor(1000 + Math.random() * 9000)}`;
  const testVin = `1HGCR2F83HA${Math.floor(100000 + Math.random() * 900000)}`;
  let vehicleId: string;
  let listingId: string;
  let rcDocId: string;

  beforeAll(() => {
    // Ensure database connection is initialized
    getDb();
  });

  it("Step 1: Seller registers a new vehicle with valid attributes", () => {
    const draft = createVehicleDraft(sellerId, {
      make: "Honda",
      model: "City",
      variant: "ZX CVT",
      year: 2022,
      regNo: testReg,
      vin: testVin,
      fuel: "Petrol",
      transmission: "Automatic",
      category: "Sedan",
      color: "Radiant Red",
      ownershipCount: 1,
      location: "Delhi",
      km: 25000,
      price: 1150000,
      condition: "Excellent",
    });

    expect(draft.ok, JSON.stringify(draft)).toBe(true);
    if (!draft.ok) return;
    expect(draft.id).toBeDefined();
    expect(draft.listingId).toBeDefined();
    vehicleId = draft.id;
    listingId = draft.listingId;
  });

  it("Step 2 (Constraint Check): Duplicate registration and VIN are strictly rejected", () => {
    const dupReg = createVehicleDraft(sellerId, {
      make: "Honda",
      model: "City",
      year: 2022,
      regNo: testReg,
      vin: `1HGCR2F83HA${Math.floor(100000 + Math.random() * 900000)}`,
    });
    expect(dupReg.ok).toBe(false);
    if (!dupReg.ok) {
      expect(dupReg.code).toBe("DUPLICATE_REG");
    }

    const dupVin = createVehicleDraft(sellerId, {
      make: "Honda",
      model: "City",
      year: 2022,
      regNo: `MH02XY${Math.floor(1000 + Math.random() * 9000)}`,
      vin: testVin,
    });
    expect(dupVin.ok).toBe(false);
    if (!dupVin.ok) {
      expect(dupVin.code).toBe("DUPLICATE_VIN");
    }
  });

  it("Step 3: Seller uploads vehicle documents with privacy consent", () => {
    const rcDoc = addDocumentForVehicle(sellerId, vehicleId, {
      type: "rc",
      fileName: "delhi-rc-certificate.pdf",
      mime: "application/pdf",
      sizeBytes: 1024 * 350,
      consent: true,
      extracted: {
        registrationNumber: testReg,
        chassisNumber: testVin,
        engineNumber: "ENG894723",
        ownerName: "Samarth Sharma",
      },
    });
    expect(rcDoc.ok).toBe(true);
    if (rcDoc.ok) {
      rcDocId = rcDoc.id;
      // In verification pipeline, valid document transitions to verified
      updateDocument(rcDocId, { status: "verified" });
    }

    const insDoc = addDocumentForVehicle(sellerId, vehicleId, {
      type: "insurance",
      fileName: "hdfc-ergo-policy.pdf",
      mime: "application/pdf",
      sizeBytes: 1024 * 420,
      consent: true,
      extracted: {
        policyNo: "POL-772819",
        validTill: "2027-04-15",
        idv: 1100000,
      },
    });
    expect(insDoc.ok).toBe(true);
  });

  it("Step 4: Seller adds service history event (stays pending until audited)", () => {
    const history = addHistoryForVehicle(sellerId, vehicleId, {
      category: "service",
      date: "2024-03-10",
      km: 20000,
      title: "20,000 km Scheduled Service",
      description: "Engine oil change, synthetic blend, brake pad inspection, wheel alignment.",
    });
    expect(history.ok).toBe(true);
  });

  it("Step 5: Seller records mileage reading with rollback detection and resolution", () => {
    // Normal reading
    const m1 = addMileageForVehicle(sellerId, vehicleId, {
      date: "2023-09-01",
      km: 15000,
      source: "authorized_center",
    });
    expect(m1.ok).toBe(true);
    if (m1.ok) expect(m1.flagged).toBe(false);

    // Rollback attempt (lower km than prior)
    const m2 = addMileageForVehicle(sellerId, vehicleId, {
      date: "2024-06-01",
      km: 12000, // rollback from 15,000!
      source: "seller_claim",
    });
    expect(m2.ok).toBe(true);
    if (m2.ok) {
      expect(m2.flagged).toBe(true);
      // Remove the erroneous test claim and clear findings for clean re-run
      getDb().prepare("DELETE FROM mileage_readings WHERE id = ?").run(m2.id);
      getDb().prepare("DELETE FROM findings WHERE vehicle_id = ?").run(vehicleId);
    }

    // Add legitimate progressive reading
    const m3 = addMileageForVehicle(sellerId, vehicleId, {
      date: "2024-06-01",
      km: 24500,
      source: "service_center",
    });
    expect(m3.ok).toBe(true);
    if (m3.ok) expect(m3.flagged).toBe(false);
  });

  it("Step 6: Seller maps 3D vehicle damage record to component ID", () => {
    const damage = addDamageForVehicle(sellerId, vehicleId, {
      zoneId: "front_bumper",
      description: "Minor parking scratch on lower right lip",
      severity: "minor",
      repairStatus: "repaired",
      repairDetails: "Buffed and repainted at authorized body shop.",
      inspectionDate: "2024-08-15",
    });
    expect(damage.ok).toBe(true);
  });

  it("Step 7: Seller runs verification pipeline and reviews results", () => {
    const run = startVerificationRun(sellerId, vehicleId);
    expect(run.ok).toBe(true);
    if (run.ok) {
      expect(run.runId).toBeDefined();
      expect(run.checks.length).toBeGreaterThan(0);
    }
  });

  it("Step 8: Seller adds listing photos and transitions listing to published", () => {
    // Satisfy minimum 3 photos gate
    createListingImage(`img-${Date.now()}-1`, listingId, "photos/test-front.webp", 0);
    createListingImage(`img-${Date.now()}-2`, listingId, "photos/test-rear.webp", 1);
    createListingImage(`img-${Date.now()}-3`, listingId, "photos/test-interior.webp", 2);

    // Complete listing details
    createListingForVehicle(sellerId, vehicleId, {
      headline: "2022 Honda City ZX — Meticulously Maintained Single Owner",
      description: "Dealer serviced with complete records, zero accident history, fresh synthetic oil.",
      condition: "Excellent",
      location: "Delhi NCR",
      price: 1150000,
    });

    const published = transitionListingForActor(sellerId, listingId, "publish");
    expect(published.ok).toBe(true);
    if (published.ok) {
      expect(published.status).toBe("published");
    }
  });

  it("Step 9: Buyer discovers the published vehicle on the Marketplace", () => {
    const marketplace = getMarketplace({ q: "Honda City" }, buyerId);
    const item = marketplace.items.find((i) => i.id === vehicleId);
    expect(item).toBeDefined();
    expect(item?.price).toBe(1150000);
    expect(item?.make).toBe("Honda");
    expect(item?.model).toBe("City");
    expect(item?.publishedAt).toBeDefined();
  });

  it("Step 10: Buyer inspects vehicle details with verified records and 3D hotspots", () => {
    const detail = getVehicleDetail(vehicleId, buyerId);
    expect(detail).toBeDefined();
    expect(detail?.vehicle.reg_no).toBe(testReg);
    expect(detail?.vehicle.vin).toBe(testVin);
    expect(detail?.trust.trustScore).toBeGreaterThan(0);
    expect(detail?.damage.length).toBeGreaterThan(0);
    expect(detail?.damage[0].zone_id).toBe("front_bumper");
    expect(detail?.pricing).toBeDefined();
  });

  it("Step 11: Buyer saves vehicle to wishlist and removes it", () => {
    const saved = saveListingForBuyer(buyerId, listingId);
    expect(saved.ok).toBe(true);

    const unsave = unsaveListingForBuyer(buyerId, listingId);
    expect(unsave.ok).toBe(true);
  });

  it("Step 12: Buyer compares vehicle with another marketplace listing", () => {
    const comp = getCompareVehicles([vehicleId, "v-bmw"], buyerId);
    expect(comp.rows.length).toBe(2);
    expect(comp.rows.some((r) => r.id === vehicleId)).toBe(true);
    expect(comp.differences.length).toBeGreaterThan(0);
  });

  it("Step 13 & 14: Buyer contacts seller, seller replies, conversation updates", () => {
    // Buyer opens inquiry
    const inq = createInquiryForBuyer(buyerId, {
      listingId,
      message: "Hello, is the car available for a test drive this Saturday in Delhi?",
      type: "test_drive",
    });
    expect(inq.ok).toBe(true);
    if (!inq.ok) return;
    const inquiryId = inq.id;

    // Seller sees inquiry in inbox
    const sellerInquiries = getInquiriesForSeller(sellerId);
    const received = sellerInquiries.find((i) => i.id === inquiryId);
    expect(received).toBeDefined();
    expect(received?.message).toContain("test drive");

    // Seller replies to buyer
    const reply = sendInquiryMessage(sellerId, inquiryId, {
      body: "Yes, Saturday afternoon at 3 PM works perfectly. Let me know if you need location coordinates.",
    });
    expect(reply.ok).toBe(true);

    // Thread contains both messages
    const thread = getInquiryThread(inquiryId);
    expect(thread).toBeDefined();
    expect(thread?.messages.length).toBe(2);
    expect(thread?.messages[0].senderId).toBe(buyerId);
    expect(thread?.messages[1].senderId).toBe(sellerId);
  });

  it("Step 15: Cross-Role Security: Buyer cannot modify seller vehicle or access unauthorized actions", () => {
    const updateAttempt = updateVehicleForOwner(buyerId, vehicleId, { make: "Hacked" });
    expect(updateAttempt.ok).toBe(false);
    if (!updateAttempt.ok) {
      expect(updateAttempt.code).toBe("FORBIDDEN");
    }

    const archiveAttempt = archiveVehicleForOwner(buyerId, vehicleId);
    expect(archiveAttempt.ok).toBe(false);
    if (!archiveAttempt.ok) {
      expect(archiveAttempt.code).toBe("FORBIDDEN");
    }
  });

  it("Step 16: Seller marks vehicle as sold, closing marketplace discovery while preserving history", () => {
    const sold = transitionListingForActor(sellerId, listingId, "sold");
    expect(sold.ok).toBe(true);
    if (sold.ok) {
      expect(sold.status).toBe("sold");
    }

    // Vehicle should no longer appear as an active published listing in marketplace search
    const marketplace = getMarketplace({ q: testReg }, buyerId);
    expect(marketplace.items.some((i) => i.id === vehicleId)).toBe(false);

    // But historical vehicle details remain accessible and intact
    const detail = getVehicleDetail(vehicleId, buyerId);
    expect(detail).toBeDefined();
    expect(detail?.vehicle.id).toBe(vehicleId);
    expect(detail?.listing?.status).toBe("sold");
  });
});
