// ---------------------------------------------------------------------------
// Seed data (Section 13). Every number, badge, chart and alert on screen comes
// from this module. In production these map 1:1 to API endpoints listed in
// Section 4 (e.g. GET /buyer/overview, GET /vehicles/:id/trust). Hard-coded JSX
// values are intentionally avoided per Section 0.3.
// ---------------------------------------------------------------------------

export type Status =
  | "verified"
  | "pending"
  | "suspicious"
  | "unverified"
  | "unavailable"
  | "needs_correction"
  | "draft"
  | "published"
  | "sold"
  | "processing"
  | "cleared"
  | "explained"
  | "open";

export interface NavItem {
  label: string;
  icon: string; // lucide icon name
  href: string;
  badge?: number;
}

export const buyerNav: NavItem[] = [
  { label: "Overview", icon: "LayoutDashboard", href: "/buyer" },
  { label: "Explore Vehicles", icon: "Compass", href: "/buyer/explore" },
  { label: "Search & Filters", icon: "Search", href: "/buyer/search" },
  { label: "Vehicle Verification", icon: "BadgeCheck", href: "/buyer/verification" },
  { label: "Vehicle History", icon: "History", href: "/buyer/history" },
  { label: "AI Risk Analysis", icon: "BrainCircuit", href: "/buyer/risk" },
  { label: "Compare Vehicles", icon: "GitCompare", href: "/buyer/compare" },
  { label: "Saved Vehicles", icon: "Heart", href: "/buyer/saved", badge: 3 },
  { label: "Reports", icon: "FileText", href: "/buyer/reports" },
  { label: "Inquiries", icon: "MessageSquare", href: "/buyer/inquiries", badge: 2 },
  { label: "Notifications", icon: "Bell", href: "/buyer/notifications" },
  { label: "Profile & Settings", icon: "Settings", href: "/buyer/settings" },
];

export const sellerNav: NavItem[] = [
  { label: "Overview", icon: "LayoutDashboard", href: "/seller" },
  { label: "My Vehicles", icon: "Car", href: "/seller/vehicles" },
  { label: "Add Vehicle", icon: "CirclePlus", href: "/seller/add-vehicle" },
  { label: "Documents", icon: "FolderOpen", href: "/seller/documents" },
  { label: "Vehicle History", icon: "History", href: "/seller/history" },
  { label: "Verification Center", icon: "ShieldCheck", href: "/seller/verification" },
  { label: "AI Fraud Analysis", icon: "ScanSearch", href: "/seller/fraud" },
  { label: "Marketplace Listings", icon: "Store", href: "/seller/listings" },
  { label: "Buyer Inquiries", icon: "MessageSquare", href: "/seller/inquiries", badge: 3 },
  { label: "Reports", icon: "FileText", href: "/seller/reports" },
  { label: "Notifications", icon: "Bell", href: "/seller/notifications", badge: 2 },
  { label: "Profile & Settings", icon: "Settings", href: "/seller/settings" },
];

export const adminNav: NavItem[] = [
  { label: "Review Queue", icon: "LayoutDashboard", href: "/admin/queue" },
  { label: "Seller KYC", icon: "BadgeCheck", href: "/admin/kyc" },
  { label: "Users", icon: "Users", href: "/admin/users" },
  { label: "Audit Log", icon: "History", href: "/admin/audit" },
  { label: "Disputes", icon: "Scale", href: "/admin/queue#disputes" },
  { label: "Listings", icon: "Store", href: "/admin/queue#listings" },
  { label: "Documents", icon: "FolderOpen", href: "/admin/queue#documents" },
];

export interface BuyerProfile {
  name: string;
  role: string;
  avatarInitials: string;
}

export const buyerProfile: BuyerProfile = {
  name: "Aditya Darak",
  role: "Buyer",
  avatarInitials: "AD",
};

export interface SellerProfile {
  name: string;
  role: string;
  avatarInitials: string;
}

export const sellerProfile: SellerProfile = {
  name: "Samarth Darak",
  role: "Seller",
  avatarInitials: "SD",
};

// ---- Buyer Overview --------------------------------------------------------

export interface ActivityStat {
  label: string;
  value: number;
  icon: string;
  href: string;
}

export const buyerActivity: ActivityStat[] = [
  { label: "Vehicles Explored", value: 12, icon: "Compass", href: "/buyer" },
  { label: "Saved Vehicles", value: 5, icon: "Heart", href: "/buyer" },
  { label: "Recently Viewed", value: 3, icon: "Eye", href: "/buyer" },
  { label: "Pending Reports", value: 2, icon: "FileClock", href: "/buyer" },
];

export interface RecommendedVehicle {
  id: string;
  listingId?: string | null;
  make: string;
  model: string;
  year: number;
  km: number;
  price: number;
  trustScore: number;
  fuel?: string;
  saved: boolean;
}

export const recommendedVehicles: RecommendedVehicle[] = [
  { id: "v-bmw", make: "BMW", model: "3 Series", year: 2021, km: 42000, price: 2600000, trustScore: 92, saved: false },
  { id: "v-audi", make: "Audi", model: "A4", year: 2020, km: 58000, price: 2250000, trustScore: 89, saved: true },
  { id: "v-merc", make: "Mercedes", model: "C-Class", year: 2022, km: 31000, price: 3400000, trustScore: 87, saved: false },
];

export interface ReportVehicle {
  make: string;
  model: string;
  regNo: string;
  year: number;
  km: number;
  fuel: string;
  transmission: string;
  trustScore: number;
  marketPrice: number;
  priceLow: number;
  priceHigh: number;
}

export const reportVehicle: ReportVehicle = {
  make: "BMW",
  model: "3 Series",
  regNo: "MH 01 AB 1234",
  year: 2021,
  km: 42000,
  fuel: "Petrol",
  transmission: "Automatic",
  trustScore: 92,
  marketPrice: 2600000,
  priceLow: 2450000,
  priceHigh: 2850000,
};

export interface Insight {
  label: string;
  detail: string;
  status: Status;
}

// Honest wording per Section 1.2 / 16 (no "No accidents", no false guarantees).
export const keyInsights: Insight[] = [
  {
    label: "Theft record",
    detail: "No theft record found in supported sources",
    status: "verified",
  },
  {
    label: "Accident history",
    detail: "No accident records found in available sources",
    status: "verified",
  },
  {
    label: "Odometer check",
    detail: "Reading consistent with service history",
    status: "verified",
  },
  {
    label: "Documents",
    detail: "RC, insurance and PUC verified",
    status: "verified",
  },
];

// ---- Seller Overview -------------------------------------------------------

export interface VehicleAlert {
  title: string;
  detail: string;
  status: Status;
}

export const vehicleAlerts: VehicleAlert[] = [
  { title: "1 document needs attention", detail: "VIN on RC does not match vehicle VIN", status: "needs_correction" },
  { title: "Mileage discrepancy detected", detail: "Reading reviewed on 2023 entry", status: "suspicious" },
  { title: "Insurance expired", detail: "Renew before publishing", status: "pending" },
  { title: "Theft record", detail: "No theft record found in supported sources", status: "verified" },
];

export interface DocCheck {
  label: string;
  status: Status;
  meta?: string;
}

export const documentCompleteness = {
  percent: 92,
  items: [
    { label: "RC Verified", status: "verified" as Status },
    { label: "Insurance Valid", status: "pending" as Status },
    { label: "PUC Uploaded", status: "verified" as Status },
    { label: "Service Records", status: "verified" as Status, meta: "4 records" },
  ],
};

export interface MileagePoint {
  year: string;
  km: number;
  flagged?: boolean;
}

export const mileageHistory: MileagePoint[] = [
  { year: "2019", km: 12000 },
  { year: "2020", km: 28000 },
  { year: "2021", km: 41000 },
  { year: "2022", km: 58000 },
  { year: "2023", km: 72450, flagged: true },
];

export interface Hotspot {
  id: string;
  label: string;
  // normalized position on the car body (0..1) for the 3D viewer
  position: [number, number, number];
}

export const sellerHotspots: Hotspot[] = [
  { id: "front-bumper", label: "Front Bumper", position: [0, 0.28, 2.1] },
  { id: "right-front-door", label: "Right Front Door", position: [1.08, 0.62, 0.7] },
  { id: "rear-door", label: "Rear Door", position: [1.08, 0.62, -0.6] },
  { id: "rear-bumper", label: "Rear Bumper", position: [0, 0.3, -2.1] },
];

export interface ListingCheck {
  label: string;
  status: Status;
}

export const listingStatus = {
  headline: "Published on Marketplace",
  items: [
    { label: "Draft — Ready for updates", status: "pending" as Status },
    { label: "Vehicle details complete", status: "verified" as Status },
    { label: "Photos uploaded", status: "verified" as Status },
    { label: "Documents verified", status: "verified" as Status },
    { label: "Inspection pending", status: "pending" as Status },
  ],
};

export interface BuyerInquiry {
  name: string;
  message: string;
  time: string;
  avatarInitials: string;
}

export const buyerInterest = {
  views: 15,
  saves: 4,
  inquiries: 3,
  recent: [
    { name: "Rohan Mehta", message: "Interested in this vehicle", time: "2h ago", avatarInitials: "RM" },
    { name: "Priya Sharma", message: "Requested more photos", time: "4h ago", avatarInitials: "PS" },
  ] as BuyerInquiry[],
};

export const sellerPriceEstimate = {
  high: 620000,
  suggested: 580000,
  low: 530000,
  askingPrice: 580000,
  note: "Based on similar vehicles.",
};

export const listingFeatures = [
  { label: "Add Photos", icon: "ImagePlus" },
  { label: "Upload Docs", icon: "Upload" },
  { label: "Set Price", icon: "Tag" },
  { label: "Write Description", icon: "PenLine" },
  { label: "Share Listing", icon: "Share2" },
  { label: "Track Inquiries", icon: "Activity" },
  { label: "Get Report", icon: "FileDown" },
];

export const sellerVehicleSelector = {
  label: "BMW 3 Series",
  sub: "MH 01 AB 1234",
};
