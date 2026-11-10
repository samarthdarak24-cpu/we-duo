/**
 * Model-accurate representative photography for demo / seller records without
 * an uploaded photo.
 *
 * IMPORTANT (product honesty rule): these are *representative* photographs of
 * the named model, not evidence of the actual vehicle. `VehiclePhoto` badges
 * each one "Demo photo" and a real seller upload always takes priority. A PDF
 * text layer is not OCR; a stock/wiki photo is not an inspection photo.
 *
 * KEY RULE: the photo must match the vehicle name. Every make/model in the seed
 * has an explicit entry sourced from that model's Wikipedia/Wikimedia lead
 * image, or from the manufacturer's own product CDN (Ather, Revolt). Generic
 * "some car" pools are only a last resort for synthetic QA records.
 *
 * Google Images thumbnail URLs (encrypted-tbn0.gstatic.com) are deliberately
 * NOT used: they expire, are low-resolution and block hotlinking -- exactly
 * what caused blank cards. These URLs are stable and were verified live by
 * `npm run verify:photos` / project/qa/verify_vehicle_photos.py.
 */

const UNSPLASH = "https://images.unsplash.com/photo-";

export type VehiclePhotoTarget = {
  id?: string | null;
  make?: string | null;
  model?: string | null;
  category?: string | null;
};

/** Exact photo for each model name present in the seeded database. */
export const MODEL_PHOTOS: Record<string, string> = {
  "ather 450x": "https://media.atherenergy.com/ather-450-overtones-new-m.webp",
  "audi a4": "https://commons.wikimedia.org/wiki/Special:FilePath/Audi_A4_B9_sedans_%28FL%29_1X7A2441.jpg?width=1000",
  "bajaj framebike": "https://commons.wikimedia.org/wiki/Special:FilePath/BAJAJ_Pulsar_NS160.jpg?width=1000",
  "bmw 3 series": "https://commons.wikimedia.org/wiki/Special:FilePath/BMW_G20_%282022%29_IMG_7316_%282%29.jpg?width=1000",
  "bmw r 1250 gs": "https://commons.wikimedia.org/wiki/Special:FilePath/BMW_R1200GS_in_Munich.jpg?width=1000",
  "ducati panigale v4": "https://commons.wikimedia.org/wiki/Special:FilePath/Ducati_Panigale_V4_-_Tuning_World_Bodensee_2018%2C_Friedrichshafen_%28OW1A0484%29.jpg?width=1000",
  "honda activa": "https://commons.wikimedia.org/wiki/Special:FilePath/Gold_Metallic_Honda_Activa.jpg?width=1000",
  "honda cb350": "https://commons.wikimedia.org/wiki/Special:FilePath/Honda_350.jpg?width=1000",
  "honda city": "https://commons.wikimedia.org/wiki/Special:FilePath/Honda_City_1.5_i-VTEC_V_%28VIII%2C_Facelift%29_%E2%80%93_f_22032025.jpg?width=1000",
  "honda city zx": "https://commons.wikimedia.org/wiki/Special:FilePath/Honda_City_1.5_i-VTEC_V_%28VIII%2C_Facelift%29_%E2%80%93_f_22032025.jpg?width=1000",
  "hyundai creta": "https://commons.wikimedia.org/wiki/Special:FilePath/2024_Hyundai_Creta_1.5_MPi_SX%28O%29_%28India%29_front_view.png?width=1000",
  "hyundai i20": "https://commons.wikimedia.org/wiki/Special:FilePath/Hyundai_i20_%28III%2C_Facelift%29_%E2%80%93_f_11102025.jpg?width=1000",
  "kawasaki ninja zx-10r": "https://commons.wikimedia.org/wiki/Special:FilePath/Kwasaki_ZX-10R_tokyo.JPG?width=1000",
  "maruti baleno": "https://commons.wikimedia.org/wiki/Special:FilePath/Suzuki_Baleno_front_20071004.jpg?width=1000",
  "mercedes c class": "https://commons.wikimedia.org/wiki/Special:FilePath/Mercedes-Benz_W206_IMG_6380.jpg?width=1000",
  "ola s1 pro": "https://commons.wikimedia.org/wiki/Special:FilePath/OLA_S1_Pro_Gen_1_Electric_Scooter.jpg?width=1000",
  "revolt rv400": "https://www.revoltmotors.com/images/model/rv400/top-banner/rv400-01.webp",
  "royal enfield classic 350": "https://commons.wikimedia.org/wiki/Special:FilePath/Royal_Enfield_Classic_350_%282017_Model_Year%29.jpg?width=1000",
  "royal enfield continental gt 650": "https://commons.wikimedia.org/wiki/Special:FilePath/Eine_Continental_GT_Bj._2014.jpg?width=1000",
  "tata nexon": "https://commons.wikimedia.org/wiki/Special:FilePath/Tata_Nexon_Blue_Dual_Tone.jpg?width=1000",
  "tata nexon ev": "https://commons.wikimedia.org/wiki/Special:FilePath/Tata_Nexon_Blue_Dual_Tone.jpg?width=1000",
  "tata nexon ev max": "https://commons.wikimedia.org/wiki/Special:FilePath/Tata_Nexon_Blue_Dual_Tone.jpg?width=1000",
  "toyota camry": "https://commons.wikimedia.org/wiki/Special:FilePath/2018_Toyota_Camry_%28ASV70R%29_Ascent_sedan_%282018-08-27%29_01.jpg?width=1000",
  "toyota fortuner": "https://commons.wikimedia.org/wiki/Special:FilePath/2015_Toyota_Fortuner_%28New_Zealand%29.jpg?width=1000",
};

/** Demo hero vehicles -> their actual model photo (not a generic car). */
const HERO_MODEL_KEYS: Record<string, string> = {
  "v-bmw": "bmw 3 series",
  "v-seller": "bmw 3 series",
  "v-audi": "audi a4",
  "v-merc": "mercedes c class",
  "v-camry": "toyota camry",
  "v-tata": "tata nexon",
  "v-hyundai": "hyundai creta",
  "v-toyota": "toyota fortuner",
  "v-honda": "honda city",
  "v-ducati": "ducati panigale v4",
  "v-royalenfield": "royal enfield continental gt 650",
  "v-kawasaki": "kawasaki ninja zx-10r",
  "v-bmw-bike": "bmw r 1250 gs",
};

export const VEHICLE_ID_PHOTOS: Record<string, string> = Object.fromEntries(
  Object.entries(HERO_MODEL_KEYS).map(([id, key]) => [id, MODEL_PHOTOS[key]])
);

/** Model-name rules, ordered most specific first. */
const MODEL_RULES: Array<[RegExp, string]> = [
  [/\b3 series\b|\b3-series\b/, "bmw 3 series"],
  [/c[- ]?class/, "mercedes c class"],
  [/\ba4\b/, "audi a4"],
  [/\bcity\b/, "honda city"],
  [/\bcamry\b/, "toyota camry"],
  [/\bcreta\b/, "hyundai creta"],
  [/\bi20\b/, "hyundai i20"],
  [/\bnexon\b/, "tata nexon"],
  [/\bbaleno\b/, "maruti baleno"],
  [/\bfortuner\b/, "toyota fortuner"],
  [/\bactiva\b/, "honda activa"],
  [/cb ?350|h'ness/, "honda cb350"],
  [/s1 ?pro|\bolas1\b|\bs1\b/, "ola s1 pro"],
  [/450x/, "ather 450x"],
  [/rv ?400/, "revolt rv400"],
  [/classic 350/, "royal enfield classic 350"],
  [/continental gt/, "royal enfield continental gt 650"],
  [/r ?1250 ?gs|r1200gs/, "bmw r 1250 gs"],
  [/panigale|v4\b/, "ducati panigale v4"],
  [/zx-?10r|ninja/, "kawasaki ninja zx-10r"],
  [/framebike|pulsar/, "bajaj framebike"],
];

/** Generic fallbacks for synthetic QA rows (no real model name). */
const POOLS = {
  sedan: ["1555215695-3004980ad54e", "1590362891991-f776e747a588", "1519641471654-76ce0107ad1b", "1603584173870-7f23fdae1b7a"],
  suv: ["1533473359331-0135ef1b58bf", "1549399542-7e3f8b79c341"],
  motorcycle: ["1558981403-c5f9899a28bc", "1449426468159-d96dbf08f19f"],
  scooter: ["1571068316344-75bc76f77890", "1591637333184-19aa84b3e01f"],
} satisfies Record<string, readonly string[]>;

type PoolName = keyof typeof POOLS;

function generic(poolName: PoolName, seed: string): string {
  const pool = POOLS[poolName];
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const id = pool[Math.abs(h) % pool.length];
  return `${UNSPLASH}${id}?auto=format&fit=crop&w=1200&q=80`;
}

export const DEFAULT_CAR_PHOTO = MODEL_PHOTOS["bmw 3 series"];
export const DEFAULT_BIKE_PHOTO = MODEL_PHOTOS["ducati panigale v4"];

/** Backwards-compatible alias used by the public marketplace section. */
export const onlineVehicleImages: Record<string, string> = {
  ...VEHICLE_ID_PHOTOS,
  defaultCar: DEFAULT_CAR_PHOTO,
  defaultBike: DEFAULT_BIKE_PHOTO,
};

function classify(target: VehiclePhotoTarget): PoolName {
  const text = `${target.make || ""} ${target.model || ""} ${target.category || ""}`.toLowerCase();
  if (/scooter|activa|s1 pro|450x|electric scooter/.test(text)) return "scooter";
  if (/motorcycle|motorbike|bike|motorrad|enfield|ducati|kawasaki|bajaj|revolt|superbike|cb350|rv400/.test(text)) return "motorcycle";
  if (/suv|nexon|creta|fortuner/.test(text)) return "suv";
  return "sedan";
}

/** Resolve a photo that matches the vehicle's actual make/model. Never null. */
export function resolveVehiclePhoto(target: VehiclePhotoTarget): string {
  const id = (target.id || "").trim();
  if (id && VEHICLE_ID_PHOTOS[id]) return VEHICLE_ID_PHOTOS[id];

  const make = (target.make || "").trim().toLowerCase();
  const model = (target.model || "").trim().toLowerCase();
  const full = `${make} ${model}`.trim();

  // 1. exact "make model" match
  if (MODEL_PHOTOS[full]) return MODEL_PHOTOS[full];
  // 2. distinctive model-name rule
  for (const [pattern, key] of MODEL_RULES) {
    if (pattern.test(model) || pattern.test(full)) {
      if (MODEL_PHOTOS[key]) return MODEL_PHOTOS[key];
    }
  }
  // 3. make-only match (e.g. "Tata" -> Nexon photo)
  for (const key of Object.keys(MODEL_PHOTOS)) {
    if (key.startsWith(make + " ") && MODEL_PHOTOS[key]) return MODEL_PHOTOS[key];
  }
  // 4. class-accurate generic photo for synthetic QA records
  return generic(classify(target), `${id}|${full}`);
}

/** Kept for callers that only have a manufacturer name. */
export function photoForMake(make?: string | null): string | null {
  return make ? resolveVehiclePhoto({ make }) : null;
}

export function isBikePhotoTarget(target: VehiclePhotoTarget): boolean {
  const pool = classify(target);
  return pool === "motorcycle" || pool === "scooter";
}
