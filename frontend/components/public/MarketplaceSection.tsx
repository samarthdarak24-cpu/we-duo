"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { Icon } from "@/components/ui/Icon";
import { resolveVehiclePhoto } from "@/lib/vehicle-images";

export interface MarketplaceVehicle {
  id: string;
  listingId: string;
  make: string;
  model: string;
  variant: string;
  year: number;
  regNo: string;
  km: number;
  price: number;
  fuel: string;
  transmission: string;
  location: string;
  ownershipCount: number;
  condition: string;
  category?: string;
  trustScore: number;
  coverage: number;
  band: string;
  sellerName: string;
  sellerType: string;
  hasAccident: boolean;
  findings: number;
  photoUrl?: string;
}

// The single source of truth for representative vehicle photography lives in
// lib/vehicle-images.ts; re-exported here for any existing importers.
export { onlineVehicleImages } from "@/lib/vehicle-images";

export function isBikeVehicle(v: MarketplaceVehicle): boolean {
  const cat = (v.category || "").toLowerCase();
  const make = v.make.toLowerCase();
  const model = v.model.toLowerCase();
  return (
    cat.includes("bike") ||
    cat.includes("motorcycle") ||
    cat.includes("superbike") ||
    make.includes("ducati") ||
    make.includes("royal enfield") ||
    make.includes("kawasaki") ||
    make.includes("motorrad") ||
    model.includes("panigale") ||
    model.includes("ninja") ||
    model.includes("continental") ||
    model.includes("gs") ||
    ["v-ducati", "v-royalenfield", "v-kawasaki", "v-bmw-bike"].includes(v.id)
  );
}

export function MarketplaceSection({
  initialVehicles = [],
}: {
  initialVehicles?: MarketplaceVehicle[];
}) {
  const [vehicleTypeTab, setVehicleTypeTab] = useState<"all" | "cars" | "bikes">("all");
  const [selectedMake, setSelectedMake] = useState<string>("All");
  const [maxPrice, setMaxPrice] = useState<number>(5000000);
  const [minYear, setMinYear] = useState<number>(2015);
  const [onlyVerified, setOnlyVerified] = useState<boolean>(false);

  // Group counts
  const counts = useMemo(() => {
    let carsCount = 0;
    let bikesCount = 0;
    initialVehicles.forEach((v) => {
      if (isBikeVehicle(v)) bikesCount++;
      else carsCount++;
    });
    return { all: initialVehicles.length, cars: carsCount, bikes: bikesCount };
  }, [initialVehicles]);

  const makes = useMemo(() => {
    const set = new Set<string>();
    initialVehicles.forEach((v) => {
      if (vehicleTypeTab === "cars" && isBikeVehicle(v)) return;
      if (vehicleTypeTab === "bikes" && !isBikeVehicle(v)) return;
      set.add(v.make);
    });
    return ["All", ...Array.from(set)];
  }, [initialVehicles, vehicleTypeTab]);

  const filteredVehicles = useMemo(() => {
    return initialVehicles.filter((v) => {
      const isBike = isBikeVehicle(v);
      if (vehicleTypeTab === "cars" && isBike) return false;
      if (vehicleTypeTab === "bikes" && !isBike) return false;
      if (selectedMake !== "All" && v.make.toLowerCase() !== selectedMake.toLowerCase()) {
        return false;
      }
      if (v.price > maxPrice) return false;
      if (v.year < minYear) return false;
      if (onlyVerified && v.trustScore < 80) return false;
      return true;
    });
  }, [initialVehicles, vehicleTypeTab, selectedMake, maxPrice, minYear, onlyVerified]);

  const formatPrice = (val: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(val);
  };

  return (
    <section id="marketplace" className="py-24 bg-[#08090A] border-t border-[#23262A]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-10 gap-6">
          <div>
            <span className="text-[11px] font-mono uppercase tracking-[0.24em] text-[#C5A46D] inline-block mb-3">
              Transparent Vehicle Discovery
            </span>
            <h2 className="font-display font-bold text-3xl sm:text-4xl text-white tracking-tight">
              Verified Cars & Superbikes Marketplace.
            </h2>
            <p className="mt-2 text-[14px] sm:text-[15px] text-[#7A8089] max-w-xl leading-relaxed">
              Real listings from authenticated owners and dealers, verified with deterministic AI inspection scores, odometer checks, and immutable SHA-256 hash chains.
            </p>
          </div>
          <Link
            href="/marketplace"
            className="inline-flex items-center gap-2 text-[12px] uppercase font-semibold tracking-wider text-[#C5A46D] hover:text-[#D6B882] py-2 px-4 rounded-full border border-[#C5A46D]/30 hover:border-[#C5A46D] transition-colors self-start md:self-auto"
          >
            <span>Open Full Inventory</span>
            <Icon name="ArrowRight" size={14} />
          </Link>
        </div>

        {/* Vehicle Category Tabs: All / Cars / Bikes */}
        <div className="flex flex-wrap items-center gap-3 mb-8 pb-4 border-b border-[#23262A]/60">
          <button
            onClick={() => {
              setVehicleTypeTab("all");
              setSelectedMake("All");
            }}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-[12px] font-semibold transition-all ${
              vehicleTypeTab === "all"
                ? "bg-[#C5A46D] text-black shadow-lg shadow-[#C5A46D]/20 font-bold"
                : "bg-[#111315] text-[#BFC3C8] hover:text-white border border-[#23262A] hover:border-[#7A8089]"
            }`}
          >
            <Icon name="Layers" size={14} />
            <span>All Verified Vehicles</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-black/20">
              {counts.all}
            </span>
          </button>

          <button
            onClick={() => {
              setVehicleTypeTab("cars");
              setSelectedMake("All");
            }}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-[12px] font-semibold transition-all ${
              vehicleTypeTab === "cars"
                ? "bg-[#C5A46D] text-black shadow-lg shadow-[#C5A46D]/20 font-bold"
                : "bg-[#111315] text-[#BFC3C8] hover:text-white border border-[#23262A] hover:border-[#7A8089]"
            }`}
          >
            <Icon name="Car" size={14} />
            <span>Luxury & Pre-Owned Cars</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-black/20">
              {counts.cars}
            </span>
          </button>

          <button
            onClick={() => {
              setVehicleTypeTab("bikes");
              setSelectedMake("All");
            }}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-[12px] font-semibold transition-all ${
              vehicleTypeTab === "bikes"
                ? "bg-[#C5A46D] text-black shadow-lg shadow-[#C5A46D]/20 font-bold"
                : "bg-[#111315] text-[#BFC3C8] hover:text-white border border-[#23262A] hover:border-[#7A8089]"
            }`}
          >
            <Icon name="Zap" size={14} />
            <span>Superbikes & Motorcycles</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-black/20">
              {counts.bikes}
            </span>
          </button>
        </div>

        {/* Secondary Filter Bar */}
        <div className="p-4 rounded-xl bg-[#111315] border border-[#23262A] mb-10 flex flex-wrap items-center justify-between gap-4 text-[13px]">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-[#7A8089] text-[11px] font-mono uppercase">Make:</span>
              <select
                value={selectedMake}
                onChange={(e) => setSelectedMake(e.target.value)}
                className="bg-[#17191C] border border-[#23262A] rounded-lg px-3 py-1.5 text-white focus:outline-none focus:border-[#C5A46D] text-[12px]"
              >
                {makes.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[#7A8089] text-[11px] font-mono uppercase">Max Price:</span>
              <select
                value={maxPrice}
                onChange={(e) => setMaxPrice(Number(e.target.value))}
                className="bg-[#17191C] border border-[#23262A] rounded-lg px-3 py-1.5 text-white focus:outline-none focus:border-[#C5A46D] text-[12px]"
              >
                <option value={500000}>Under ₹5 Lakh</option>
                <option value={1500000}>Under ₹15 Lakh</option>
                <option value={2500000}>Under ₹25 Lakh</option>
                <option value={5000000}>Up to ₹50 Lakh</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[#7A8089] text-[11px] font-mono uppercase">Min Year:</span>
              <select
                value={minYear}
                onChange={(e) => setMinYear(Number(e.target.value))}
                className="bg-[#17191C] border border-[#23262A] rounded-lg px-3 py-1.5 text-white focus:outline-none focus:border-[#C5A46D] text-[12px]"
              >
                <option value={2015}>2015+</option>
                <option value={2019}>2019+</option>
                <option value={2021}>2021+</option>
              </select>
            </div>

            <label className="flex items-center gap-2 cursor-pointer select-none ml-2">
              <input
                type="checkbox"
                checked={onlyVerified}
                onChange={(e) => setOnlyVerified(e.target.checked)}
                className="rounded accent-[#C5A46D] cursor-pointer"
              />
              <span className="text-[#BFC3C8] text-[12px]">Trust Score ≥ 80</span>
            </label>
          </div>

          <div className="text-[11px] font-mono text-[#7A8089]">
            Showing <span className="text-[#C5A46D] font-bold">{filteredVehicles.length}</span> verified units
          </div>
        </div>

        {/* Vehicle Grid */}
        {filteredVehicles.length === 0 ? (
          <div className="py-20 text-center rounded-2xl border border-[#23262A] bg-[#111315] p-8">
            <div className="w-12 h-12 rounded-full bg-[#17191C] border border-[#23262A] text-[#7A8089] flex items-center justify-center mx-auto mb-3">
              <Icon name="Car" size={22} />
            </div>
            <h3 className="font-display text-lg font-bold text-white">
              No Verified Vehicles Match Filters
            </h3>
            <p className="mt-1 text-[13px] text-[#7A8089] max-w-sm mx-auto">
              We never fabricate live vehicle listings. Try adjusting your make, price, or vehicle type filters.
            </p>
            <button
              onClick={() => {
                setVehicleTypeTab("all");
                setSelectedMake("All");
                setMaxPrice(5000000);
                setMinYear(2015);
                setOnlyVerified(false);
              }}
              className="mt-4 px-4 py-2 rounded-full border border-[#23262A] bg-[#17191C] text-[12px] font-semibold text-[#BFC3C8] hover:text-white"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredVehicles.map((vehicle) => {
              const isBike = isBikeVehicle(vehicle);
              const imageSrc = resolveVehiclePhoto({
                id: vehicle.id,
                make: vehicle.make,
                model: vehicle.model,
                category: vehicle.category,
              });

              return (
                <div
                  key={vehicle.id}
                  className="group rounded-2xl border border-[#23262A] bg-[#111315] overflow-hidden hover:border-[#C5A46D]/60 transition-all duration-300 flex flex-col hover:shadow-2xl hover:shadow-black"
                >
                  {/* Photo Container */}
                  <div className="relative h-56 w-full overflow-hidden bg-[#17191C]">
                    <Image
                      src={imageSrc}
                      alt={`${vehicle.year} ${vehicle.make} ${vehicle.model}`}
                      fill
                      unoptimized
                      sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                      className="object-cover group-hover:scale-105 transition-transform duration-700"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#111315] via-[#111315]/20 to-transparent opacity-85" />

                    {/* Trust Score Badge */}
                    <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#08090A]/85 backdrop-blur-md border border-[#23262A]">
                      <div
                        className={`w-2 h-2 rounded-full ${
                          vehicle.trustScore >= 85
                            ? "bg-[#36B982]"
                            : vehicle.trustScore >= 70
                            ? "bg-[#E7A83E]"
                            : "bg-[#D95757]"
                        }`}
                      />
                      <span className="text-[11px] font-bold text-white font-mono">
                        {vehicle.trustScore}/100
                      </span>
                      <span className="text-[10px] text-[#7A8089] uppercase tracking-wider font-mono">
                        {vehicle.band}
                      </span>
                    </div>

                    {/* Vehicle Type Pill (Car vs Bike) */}
                    <div className="absolute top-3 right-3 flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider px-2.5 py-1 rounded-full bg-[#08090A]/85 border border-[#23262A] text-[#C5A46D] backdrop-blur-md">
                      <Icon name={isBike ? "Zap" : "Car"} size={11} />
                      <span>{isBike ? "Motorcycle" : "Automobile"}</span>
                    </div>

                    {/* Location Badge */}
                    <div className="absolute bottom-3 left-3 text-[11px] text-[#BFC3C8] flex items-center gap-1 bg-[#08090A]/80 px-2.5 py-0.5 rounded-full backdrop-blur-sm border border-[#23262A]/60">
                      <Icon name="MapPin" size={11} className="text-[#C5A46D]" />
                      <span>{vehicle.location}</span>
                    </div>

                    {/* Category Label */}
                    <div className="absolute bottom-3 right-3 text-[10px] font-mono uppercase tracking-wider text-[#7A8089] bg-[#08090A]/80 px-2 py-0.5 rounded">
                      {vehicle.category || (isBike ? "Superbike" : "Sedan")}
                    </div>
                  </div>

                  {/* Card Content */}
                  <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-mono uppercase tracking-wider text-[#7A8089]">
                          {vehicle.year} &bull; {vehicle.fuel} &bull; {vehicle.transmission}
                        </span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#17191C] border border-[#23262A] text-[#BFC3C8]">
                          {vehicle.ownershipCount} {vehicle.ownershipCount === 1 ? "Owner" : "Owners"}
                        </span>
                      </div>

                      <h3 className="font-display font-bold text-lg text-white mt-1 group-hover:text-[#F5F5F5] transition-colors">
                        {vehicle.make} {vehicle.model}
                      </h3>
                      <div className="text-[12px] text-[#7A8089] truncate">
                        {vehicle.variant} &bull; Reg: {vehicle.regNo}
                      </div>

                      {/* Mileage & Status Indicators */}
                      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] font-mono border-y border-[#23262A]/60 py-2.5">
                        <div>
                          <span className="text-[#7A8089] block text-[10px]">VERIFIED ODOMETER</span>
                          <span className="text-white font-bold">
                            {vehicle.km.toLocaleString()} km
                          </span>
                        </div>
                        <div>
                          <span className="text-[#7A8089] block text-[10px]">ACCIDENT RECORD</span>
                          <span
                            className={
                              vehicle.hasAccident
                                ? "text-[#E7A83E] font-medium"
                                : "text-[#36B982] font-medium"
                            }
                          >
                            {vehicle.hasAccident ? "Prior Claim Found" : "No Record Found"}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="pt-2 flex items-center justify-between gap-3">
                      <div>
                        <div className="text-[10px] font-mono uppercase tracking-wider text-[#7A8089]">
                          ASKING PRICE
                        </div>
                        <div className="font-display font-extrabold text-xl text-white">
                          {formatPrice(vehicle.price)}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Link
                          href={`/vehicle/${vehicle.id}`}
                          className="px-4 py-2 rounded-full bg-[#F5F5F5] hover:bg-white text-black text-[12px] font-bold uppercase tracking-wider transition-all duration-200 active:scale-95 shadow-md flex items-center gap-1.5"
                        >
                          <span>Inspect</span>
                          <Icon name="ArrowRight" size={13} />
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
