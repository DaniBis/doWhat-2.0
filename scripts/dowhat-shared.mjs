import { createHash } from "node:crypto";

/**
 * @typedef {Object} AvailabilityWindowEntry
 * @property {string} day
 * @property {string} start
 * @property {string} end
 */

/**
 * @typedef {Object} SeedUser
 * @property {string} slug
 * @property {string} email
 * @property {string} fullName
 * @property {string} primarySport
 * @property {string} playStyle
 * @property {number} reliabilityScore
 * @property {{ lat: number, lng: number }} homeBase
 * @property {AvailabilityWindowEntry[]} availabilityWindow
 * @property {{ sport: string, skillLevel: string }[]} sportProfiles
 * @property {string=} password
 */

/**
 * @typedef {Object} SeedVenue
 * @property {string} slug
 * @property {string} name
 * @property {number} lat
 * @property {number} lng
 * @property {string} address
 * @property {Record<string, unknown>=} metadata
 */

/**
 * @typedef {Object} SeedActivity
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} sportType
 * @property {number} defaultPriceCents
 */

/**
 * @typedef {Object} SeedSession
 * @property {string} slug
 * @property {string} hostEmail
 * @property {string} activitySlug
 * @property {string} venueSlug
 * @property {number} startsInHours
 * @property {number} durationMinutes
 * @property {number=} priceCents
 * @property {number=} maxAttendees
 * @property {"public"|"friends"=} visibility
 * @property {{ slots: number, requiredSkillLevel?: string|null }} openSlot
 * @property {string=} description
 */

export const seedTag = "dowhat:bucuresti";
export const pledgeVersion = "dowhat-v1";

/** @type {SeedUser[]} */
export const SEED_USERS = [
  {
    slug: "padel-host",
    email: "mara.padel.host@dowhat.dev",
    fullName: "Mara Popescu",
    primarySport: "padel",
    playStyle: "competitive",
    reliabilityScore: 985,
    homeBase: { lat: 44.4766, lng: 26.0812 },
    availabilityWindow: [
      { day: "tue", start: "18:00", end: "22:00" },
      { day: "thu", start: "18:00", end: "22:00" },
    ],
    sportProfiles: [{ sport: "padel", skillLevel: "4.5 - Competitive club" }],
  },
  {
    slug: "run-host",
    email: "alex.run.host@dowhat.dev",
    fullName: "Alex Ionescu",
    primarySport: "running",
    playStyle: "fun",
    reliabilityScore: 940,
    homeBase: { lat: 44.4116, lng: 26.0991 },
    availabilityWindow: [
      { day: "mon", start: "06:00", end: "08:00" },
      { day: "sat", start: "07:00", end: "10:00" },
    ],
    sportProfiles: [{ sport: "running", skillLevel: "Tempo · 5:00/km" }],
  },
  {
    slug: "climb-host",
    email: "ioana.climb.host@dowhat.dev",
    fullName: "Ioana Dumitru",
    primarySport: "climbing",
    playStyle: "competitive",
    reliabilityScore: 960,
    homeBase: { lat: 44.4419, lng: 26.0513 },
    availabilityWindow: [
      { day: "wed", start: "17:00", end: "21:00" },
      { day: "sun", start: "10:00", end: "14:00" },
    ],
    sportProfiles: [{ sport: "climbing", skillLevel: "V4 / 5.11" }],
  },
];

/** @type {SeedVenue[]} */
export const SEED_VENUES = [
  {
    slug: "herastrau-padel",
    name: "Herăstrău Padel Club",
    lat: 44.47662,
    lng: 26.08021,
    address: "Șoseaua Nordului 7-9, Bucharest",
  },
  {
    slug: "tineretului-track",
    name: "Parcul Tineretului Track",
    lat: 44.41165,
    lng: 26.09915,
    address: "Parcul Tineretului, București",
  },
  {
    slug: "blocx-bouldering",
    name: "BlocX Bouldering Gym",
    lat: 44.44191,
    lng: 26.05132,
    address: "Calea Giulești 14, Bucharest",
  },
];

/** @type {SeedActivity[]} */
export const SEED_ACTIVITIES = [
  {
    slug: "sunrise-padel-rally",
    name: "Sunrise Padel Rally",
    description: "Intermediate padel ladder focused on clutch points and fast rallies.",
    sportType: "padel",
    defaultPriceCents: 7000,
  },
  {
    slug: "herastrau-run-crew",
    name: "Herăstrău Sunrise Run",
    description: "Lake loop tempo run with optional strides after coffee.",
    sportType: "running",
    defaultPriceCents: 0,
  },
  {
    slug: "blocx-boulder-social",
    name: "BlocX Boulder Social",
    description: "Circuit-style bouldering problems followed by recovery smoothies.",
    sportType: "climbing",
    defaultPriceCents: 5000,
  },
];

/** @type {SeedSession[]} */
export const SEED_SESSIONS = [
  {
    slug: "padel-friday-dash",
    hostEmail: "mara.padel.host@dowhat.dev",
    activitySlug: "sunrise-padel-rally",
    venueSlug: "herastrau-padel",
    startsInHours: 6,
    durationMinutes: 90,
    priceCents: 7000,
    maxAttendees: 8,
    visibility: "public",
    openSlot: { slots: 2, requiredSkillLevel: "3.5 - Consistent rallies" },
    description: "Match tie-break format, looking for two consistent right-handed teammates.",
  },
  {
    slug: "run-saturday-tempo",
    hostEmail: "alex.run.host@dowhat.dev",
    activitySlug: "herastrau-run-crew",
    venueSlug: "tineretului-track",
    startsInHours: 18,
    durationMinutes: 70,
    priceCents: 0,
    maxAttendees: 12,
    visibility: "public",
    openSlot: { slots: 5, requiredSkillLevel: "Tempo · 5:00/km" },
    description: "5x2km tempo with 90s jog. Pacers needed for the 5:00/km lane.",
  },
  {
    slug: "climb-sunday-social",
    hostEmail: "ioana.climb.host@dowhat.dev",
    activitySlug: "blocx-boulder-social",
    venueSlug: "blocx-bouldering",
    startsInHours: 32,
    durationMinutes: 110,
    priceCents: 5000,
    maxAttendees: 10,
    visibility: "friends",
    openSlot: { slots: 3, requiredSkillLevel: "V2 / 5.10" },
    description: "Project-sharing circuit up to V5. Bring your own chalk, looking for climbers who love beta swaps.",
  },
];

const formatUuid = (bytes) => {
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
};

export const uuidFromSeed = (seed) => {
  const hash = createHash("sha256").update(seed).digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return formatUuid(bytes);
};
