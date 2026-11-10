import { describe, it, expect } from "vitest";
import {
  DEFAULT_CAR_PHOTO,
  DEFAULT_BIKE_PHOTO,
  MODEL_PHOTOS,
  VEHICLE_ID_PHOTOS,
  isBikePhotoTarget,
  onlineVehicleImages,
  photoForMake,
  resolveVehiclePhoto,
} from "../lib/vehicle-images";

// Every real make/model in the seeded database, paired with the catalogue key
// whose photograph actually depicts that model. This is the regression guard
// for "vehicle name and image URL do not match".
const SEEDED_VEHICLES: Array<[string, string, string, string]> = [
  ["BMW", "3 Series", "Sedan", "bmw 3 series"],
  ["Mercedes-Benz", "C-Class", "Sedan", "mercedes c class"],
  ["Audi", "A4", "Sedan", "audi a4"],
  ["Honda", "City", "Sedan", "honda city"],
  ["Honda", "City ZX", "Sedan", "honda city zx"],
  ["Toyota", "Camry", "Sedan", "toyota camry"],
  ["Hyundai", "Creta", "SUV", "hyundai creta"],
  ["Hyundai", "i20", "Hatchback", "hyundai i20"],
  ["Tata", "Nexon", "SUV", "tata nexon"],
  ["Tata", "Nexon EV", "Electric Car", "tata nexon ev"],
  ["Tata", "Nexon EV Max", "Electric Car", "tata nexon ev max"],
  ["Maruti", "Baleno", "Petrol Car", "maruti baleno"],
  ["Toyota", "Fortuner", "SUV", "toyota fortuner"],
  ["Honda", "Activa 6G", "Petrol Scooter", "honda activa"],
  ["Honda", "H'ness CB350", "Motorcycle", "honda cb350"],
  ["Ola", "S1 Pro", "Electric Scooter", "ola s1 pro"],
  ["Ola Electric", "S1 Pro", "Scooter", "ola s1 pro"],
  ["Ather", "450X", "Electric Scooter", "ather 450x"],
  ["Revolt", "RV400", "Electric Motorcycle", "revolt rv400"],
  ["Revolt Motors", "RV400", "Electric Motorcycle", "revolt rv400"],
  ["Royal Enfield", "Classic 350", "Motorcycle", "royal enfield classic 350"],
  ["Royal Enfield", "Continental GT 650", "Motorcycle", "royal enfield continental gt 650"],
  ["Bajaj", "FrameBike", "Petrol Motorcycle", "bajaj framebike"],
  ["BMW Motorrad", "R 1250 GS", "Adventure Bike", "bmw r 1250 gs"],
  ["Ducati", "Panigale V4", "Superbike", "ducati panigale v4"],
  ["Kawasaki", "Ninja ZX-10R", "Superbike", "kawasaki ninja zx-10r"],
];

describe("model-accurate vehicle photos", () => {
  it("every seeded vehicle resolves to the photo of ITS OWN model", () => {
    for (const [make, model, category, key] of SEEDED_VEHICLES) {
      expect(MODEL_PHOTOS[key], `missing catalogue entry for ${make} ${model}`).toBeTruthy();
      expect(resolveVehiclePhoto({ make, model, category })).toBe(MODEL_PHOTOS[key]);
    }
  });

  it("no vehicle is left blank and every URL is https", () => {
    for (const [make, model, category] of SEEDED_VEHICLES) {
      expect(resolveVehiclePhoto({ make, model, category })).toMatch(/^https:\/\//);
    }
    // Synthetic QA rows without a real model still get a class-accurate photo.
    for (const [make, model] of [
      ["QA", "Integration"],
      ["WiringTest", "Live-MW6R8XJM"],
      ["Independent", "QA Sedan"],
    ]) {
      expect(resolveVehiclePhoto({ make, model, category: "Sedan" })).toMatch(/^https:\/\//);
    }
  });

  it("different named models do not silently share one photo", () => {
    const groups = [
      ["Honda", "City"],
      ["BMW", "3 Series"],
      ["Tata", "Nexon"],
      ["Ducati", "Panigale V4"],
      ["Ola", "S1 Pro"],
      ["Ather", "450X"],
    ] as const;
    const urls = groups.map(([make, model]) => resolveVehiclePhoto({ make, model }));
    expect(new Set(urls).size).toBe(groups.length);
  });

  it("hero ids point at their real model photo", () => {
    expect(resolveVehiclePhoto({ id: "v-honda" })).toBe(MODEL_PHOTOS["honda city"]);
    expect(resolveVehiclePhoto({ id: "v-ducati" })).toBe(MODEL_PHOTOS["ducati panigale v4"]);
    expect(resolveVehiclePhoto({ id: "v-audi" })).toBe(MODEL_PHOTOS["audi a4"]);
    for (const id of Object.keys(VEHICLE_ID_PHOTOS)) {
      expect(resolveVehiclePhoto({ id })).toBe(VEHICLE_ID_PHOTOS[id]);
    }
  });

  it("is deterministic, and QA rows still vary", () => {
    const target = { id: "v-123", make: "Honda", model: "City", category: "Sedan" };
    expect(resolveVehiclePhoto(target)).toBe(resolveVehiclePhoto(target));
    const qa = new Set(
      Array.from({ length: 10 }, (_, i) =>
        resolveVehiclePhoto({ id: `qa-${i}`, make: "WiringTest", model: "Live-Probe", category: "Sedan" })
      )
    );
    expect(qa.size).toBeGreaterThan(1);
  });

  it("classifies two-wheelers separately from cars", () => {
    expect(isBikePhotoTarget({ make: "Ducati", model: "Panigale V4" })).toBe(true);
    expect(isBikePhotoTarget({ make: "Honda", model: "Activa 6G", category: "Scooter" })).toBe(true);
    expect(isBikePhotoTarget({ make: "BMW", model: "3 Series" })).toBe(false);
  });

  it("keeps the public-site alias and photoForMake compatible", () => {
    expect(onlineVehicleImages.defaultCar).toBe(DEFAULT_CAR_PHOTO);
    expect(onlineVehicleImages.defaultBike).toBe(DEFAULT_BIKE_PHOTO);
    expect(photoForMake("Honda")).toMatch(/^https:\/\//);
    expect(photoForMake()).toBeNull();
  });

  it("never uses expiring Google thumbnail URLs", () => {
    for (const url of Object.values(MODEL_PHOTOS)) expect(url).not.toContain("gstatic");
  });
});
