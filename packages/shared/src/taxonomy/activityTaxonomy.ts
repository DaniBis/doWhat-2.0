import {
  ActivityTagLookup,
  ActivityTaxonomy,
  ActivityTier3WithAncestors,
} from "./types";

export const activityTaxonomyVersion = "2025-11-18";

export const activityTaxonomy: ActivityTaxonomy = [
  {
    id: "move-active",
    label: "Move & Sweat",
    description: "Group workouts and playful training that raise heart rates.",
    iconKey: "activity-run",
    colorToken: "emerald-500",
    tags: ["movement", "fitness", "sports"],
    children: [
      {
        id: "move-cardio",
        label: "Cardio Clubs",
        description: "Endurance focused crews for runs, rides, and rhythm cardio.",
        iconKey: "activity-run",
        tags: ["cardio", "endurance", "group-fitness"],
        children: [
          {
            id: "city-run-crews",
            label: "City Run Crews",
            description: "Weekly paced runs, track workouts, and race prep shakeouts.",
            tags: ["run", "running", "run-club", "tempo", "road-run"],
          },
          {
            id: "tempo-cycling-meetups",
            label: "Tempo Cycling Meetups",
            description: "Social road rides, spin pop ups, and indoor cycling mashups.",
            tags: ["cycling", "spin", "bike-ride", "ride-club", "cardio"],
          },
          {
            id: "dance-cardio-parties",
            label: "Dance Cardio Parties",
            description: "Follow along choreography classes with high energy playlists.",
            tags: ["dance", "cardio", "high-energy", "studio", "group-class"],
          },
        ],
      },
      {
        id: "move-strength",
        label: "Strength & Skill",
        description: "Skill based sessions that mix strength, agility, and playful comp.",
        iconKey: "barbell",
        tags: ["strength", "skill", "training"],
        children: [
          {
            id: "functional-fitness-pods",
            label: "Functional Fitness Pods",
            description: "Small pod circuits, HIIT labs, and hybrid strength classes.",
            tags: ["hiit", "functional", "strength", "pods", "gym"],
          },
          {
            id: "climbing-bouldering-labs",
            label: "Climbing + Bouldering",
            description: "Indoor bouldering circuits, lead clinics, and beta shares.",
            tags: ["climb", "boulder", "wall", "grip", "indoor"],
          },
          {
            id: "boxing-combat-labs",
            label: "Boxing & Combat Labs",
            description: "Pad work, bag rounds, and intro sparring with pro coaching.",
            tags: ["boxing", "combat", "spar", "bag-work", "martial"],
          },
        ],
      },
      {
        id: "move-flow",
        label: "Flow & Recovery",
        description: "Mindful movement and mobility focused reset formats.",
        iconKey: "yin-yang",
        tags: ["mobility", "recovery", "mindful"],
        children: [
          {
            id: "vinyasa-flow-sessions",
            label: "Vinyasa Flow Sessions",
            description: "Dynamic yoga classes pairing breath, balance, and heat.",
            tags: ["yoga", "vinyasa", "flow", "studio", "breath"],
          },
          {
            id: "pilates-mat-labs",
            label: "Pilates Mat Labs",
            description: "Core focused pilates pop ups, props optional.",
            tags: ["pilates", "core", "low-impact", "sculpt", "conditioning"],
          },
          {
            id: "mobility-reset-circuits",
            label: "Mobility Reset Circuits",
            description: "Guided stretch, recovery toys, and nervous system downshift.",
            tags: ["mobility", "stretch", "recovery", "foam-roll", "restore"],
          },
        ],
      },
    ],
  },
  {
    id: "create-craft",
    label: "Create & Craft",
    description: "Hands-on art, sound, and maker sessions for curious minds.",
    iconKey: "brush",
    colorToken: "amber-500",
    tags: ["art", "maker", "creative"],
    children: [
      {
        id: "visual-studios",
        label: "Visual Studios",
        description: "Illustration, painting, and visual storytelling meetups.",
        iconKey: "color-palette",
        tags: ["visual", "art", "studio"],
        children: [
          {
            id: "urban-sketch-walks",
            label: "Urban Sketch Walks",
            description: "Guided sketch strolls capturing streets, cafes, and skylines.",
            tags: ["sketch", "drawing", "plein-air", "art-walk", "illustration"],
          },
          {
            id: "open-studio-painting",
            label: "Open Studio Painting",
            description: "Drop in easels with supplies, prompts, and critique circles.",
            tags: ["painting", "canvas", "watercolor", "acrylic", "studio"],
          },
          {
            id: "community-mural-builds",
            label: "Community Mural Builds",
            description: "Large scale collaborative pieces with rotating crews.",
            tags: ["mural", "street-art", "spray", "collab", "public-art"],
          },
        ],
      },
      {
        id: "sound-stage",
        label: "Sound & Stage",
        description: "Music, performance, and storytelling micro labs.",
        iconKey: "mic",
        tags: ["music", "performance", "stage"],
        children: [
          {
            id: "jam-session-lounges",
            label: "Jam Session Lounges",
            description: "Improvised music circles, beat cyphers, and collab sessions.",
            tags: ["jam", "music", "band", "improv", "beat"],
          },
          {
            id: "open-mic-evenings",
            label: "Open Mic Evenings",
            description: "Spoken word, standup, and storytelling open floors.",
            tags: ["open-mic", "spoken-word", "standup", "story", "performance"],
          },
          {
            id: "dance-choreo-workshops",
            label: "Dance Choreo Workshops",
            description: "Taught combos for styles from hip-hop to contemporary.",
            tags: ["dance", "choreo", "class", "combo", "learn"],
          },
        ],
      },
      {
        id: "build-craft",
        label: "Build & Craft",
        description: "Make, prototype, and fabricate with expert guides.",
        iconKey: "hammer",
        tags: ["maker", "craft", "hands-on"],
        children: [
          {
            id: "makerspace-build-nights",
            label: "Makerspace Build Nights",
            description: "Hardware prototyping, welding, and CNC for side projects.",
            tags: ["makerspace", "hardware", "cnc", "prototype", "diy"],
          },
          {
            id: "ceramics-and-clay-labs",
            label: "Ceramics & Clay Labs",
            description: "Wheel throwing, hand building, glazing, and kiln drop offs.",
            tags: ["ceramic", "clay", "wheel", "glaze", "studio"],
          },
          {
            id: "textile-upcycle-labs",
            label: "Textile Upcycle Labs",
            description: "Sewing, embroidery, and visible mending with shared stashes.",
            tags: ["textile", "sewing", "upcycle", "mend", "fashion"],
          },
        ],
      },
    ],
  },
  {
    id: "connect-play",
    label: "Connect & Play",
    description: "Social formats that prioritize belonging, play, and service.",
    iconKey: "people",
    colorToken: "sky-500",
    tags: ["community", "social", "connection"],
    children: [
      {
        id: "social-games",
        label: "Social Games",
        description: "Playful formats for friendly competition and co-op fun.",
        iconKey: "game-controller",
        tags: ["games", "competition", "fun"],
        children: [
          {
            id: "board-game-cafes",
            label: "Board Game Cafes",
            description: "Curated board game nights with hosts and learn-to-play tables.",
            tags: ["board-game", "tabletop", "strategy", "party-game", "cafe"],
          },
          {
            id: "trivia-quiz-nights",
            label: "Trivia & Quiz Nights",
            description: "Hosted trivia, themed quizzes, and rotating prize pools.",
            tags: ["trivia", "quiz", "pub-night", "team", "hosted"],
          },
          {
            id: "esports-lan-nights",
            label: "eSports & LAN Nights",
            description: "Casual competitive gaming, co-op LAN setups, and watch parties.",
            tags: ["esports", "lan", "gaming", "tournament", "co-op"],
          },
        ],
      },
      {
        id: "community-pulse",
        label: "Community Pulse",
        description: "Gatherings focused on service, mutual aid, and civic pride.",
        iconKey: "hand-holding-heart",
        tags: ["community", "service", "impact"],
        children: [
          {
            id: "volunteer-blitz-days",
            label: "Volunteer Blitz Days",
            description: "High impact volunteer sprints spanning several partners.",
            tags: ["volunteer", "service", "impact", "nonprofit", "community"],
          },
          {
            id: "neighborhood-clean-walks",
            label: "Neighborhood Clean Walks",
            description: "Trash pickups, community walks, and block beautification.",
            tags: ["cleanup", "neighborhood", "walk", "green", "civic"],
          },
          {
            id: "skill-swap-meetups",
            label: "Skill Swap Meetups",
            description: "Barter style gatherings exchanging lessons and expertise.",
            tags: ["skill-swap", "barter", "teach", "learn", "community"],
          },
        ],
      },
      {
        id: "night-social",
        label: "Night & Social",
        description: "Evening formats for small talk optional, meaningful chats.",
        iconKey: "sparkles",
        tags: ["night", "social", "conversation"],
        children: [
          {
            id: "rooftop-mixers",
            label: "Rooftop Mixers",
            description: "Curated guest lists, playlists, and vibe leaders.",
            tags: ["mixer", "rooftop", "network", "night", "social"],
          },
          {
            id: "supper-club-tables",
            label: "Supper Club Tables",
            description: "Intimate pop up dinners with guided conversation decks.",
            tags: ["supper-club", "dinner", "chef", "tasting", "conversation"],
          },
          {
            id: "language-exchange-lounges",
            label: "Language Exchange Lounges",
            description: "Pairings for language swaps, culture chats, and games.",
            tags: ["language", "exchange", "conversation", "meetup", "culture"],
          },
        ],
      },
    ],
  },
  {
    id: "discover-taste",
    label: "Discover & Taste",
    description: "City discovery, culinary trails, and cultural sparks.",
    iconKey: "compass",
    colorToken: "rose-500",
    tags: ["food", "discovery", "culture"],
    children: [
      {
        id: "food-drink-trails",
        label: "Food & Drink Trails",
        description: "Guided tastings that spotlight local makers and chefs.",
        iconKey: "restaurant",
        tags: ["food", "drink", "tasting"],
        children: [
          {
            id: "specialty-coffee-crawls",
            label: "Specialty Coffee Crawls",
            description: "Progressive cuppings, brew demos, and roaster meetups.",
            tags: ["coffee", "cafe", "crawl", "brew", "cupping"],
          },
          {
            id: "street-food-hunts",
            label: "Street Food Hunts",
            description: "Guided journeys through night markets and vendor gems.",
            tags: ["street-food", "night-market", "crawl", "local", "food-tour"],
          },
          {
            id: "natural-wine-tastings",
            label: "Natural Wine Tastings",
            description: "Flights starring low intervention bottles and bottle shares.",
            tags: ["wine", "natural-wine", "tasting", "bottle-share", "bar"],
          },
        ],
      },
      {
        id: "city-explorer",
        label: "City Explorer",
        description: "Urban adventures for history, design, and hidden gems.",
        iconKey: "map",
        tags: ["urban", "tour", "explore"],
        children: [
          {
            id: "architecture-walks",
            label: "Architecture Walks",
            description: "Guided tours focused on design history and new builds.",
            tags: ["architecture", "walk", "tour", "design", "history"],
          },
          {
            id: "hidden-gallery-tours",
            label: "Hidden Gallery Tours",
            description: "Rotating gallery previews, curator talks, and indie museums.",
            tags: ["gallery", "tour", "art", "curator", "culture"],
          },
          {
            id: "street-photography-missions",
            label: "Street Photography Missions",
            description: "Photo walks with prompts, critiques, and location swaps.",
            tags: ["photo", "street", "walk", "prompt", "camera"],
          },
        ],
      },
      {
        id: "culture-capsules",
        label: "Culture Capsules",
        description: "Film, literature, and micro performance programming.",
        iconKey: "film",
        tags: ["culture", "media", "stories"],
        children: [
          {
            id: "indie-film-screenings",
            label: "Indie Film Screenings",
            description: "Micro cinema pop ups with talkbacks and director drops.",
            tags: ["film", "screening", "indie", "talkback", "cinema"],
          },
          {
            id: "micro-theater-nights",
            label: "Micro Theater Nights",
            description: "Short form theater and immersive vignettes.",
            tags: ["theater", "immersive", "perform", "stage", "culture"],
          },
          {
            id: "book-author-circles",
            label: "Book & Author Circles",
            description: "Book discussions, live readings, and local author salons.",
            tags: ["book", "reading", "author", "literature", "discussion"],
          },
        ],
      },
    ],
  },
  {
    id: "nature-escape",
    label: "Nature & Escape",
    description: "Experiences that lean into outdoor energy and calm.",
    iconKey: "leaf",
    colorToken: "lime-500",
    tags: ["nature", "outdoors", "escape"],
    children: [
      {
        id: "outdoor-adventure",
        label: "Outdoor Adventure",
        description: "Human powered adventures just outside the city core.",
        iconKey: "mountain",
        tags: ["adventure", "outdoor", "elevation"],
        children: [
          {
            id: "sunrise-hike-crews",
            label: "Sunrise Hike Crews",
            description: "Early start hikes with summit snacks and transit logistics.",
            tags: ["hike", "sunrise", "trail", "outdoor", "group"],
          },
          {
            id: "trail-running-escapes",
            label: "Trail Running Escapes",
            description: "Single track jogs with guides, shuttles, and recovery dips.",
            tags: ["trail", "run", "singletrack", "nature", "cardio"],
          },
          {
            id: "bikepacking-overnights",
            label: "Bikepacking Overnights",
            description: "Overnight rides with camping, route cards, and gear support.",
            tags: ["bikepacking", "overnight", "ride", "camp", "cycle"],
          },
        ],
      },
      {
        id: "water-sun",
        label: "Water & Sun",
        description: "Water based gatherings for play, calm, or cross training.",
        iconKey: "water",
        tags: ["water", "sun", "blue-space"],
        children: [
          {
            id: "paddleboard-meetups",
            label: "Paddleboard Meetups",
            description: "SUP tours, technique minis, and sunrise paddles.",
            tags: ["sup", "paddle", "water", "balance", "sunrise"],
          },
          {
            id: "wild-swim-clubs",
            label: "Wild Swim Clubs",
            description: "Group dips, safety briefings, and cold water breath work.",
            tags: ["swim", "wild-swim", "cold-plunge", "water", "community"],
          },
          {
            id: "beach-volley-socials",
            label: "Beach Volley Socials",
            description: "Friendly beach volleyball ladders with music and snacks.",
            tags: ["volleyball", "beach", "sand", "social", "sport"],
          },
        ],
      },
      {
        id: "calm-nature",
        label: "Calm Nature",
        description: "Slow outdoor time for grounding, senses, and reflection.",
        iconKey: "leaf",
        tags: ["calm", "mindful", "nature"],
        children: [
          {
            id: "forest-bathing-walks",
            label: "Forest Bathing Walks",
            description: "Guided sensory walks with tea shares and journaling.",
            tags: ["forest", "bathing", "mindful", "walk", "grounding"],
          },
          {
            id: "park-meditation-circles",
            label: "Park Meditation Circles",
            description: "Drop in cushions, guided meditations, and breath cues.",
            tags: ["meditation", "park", "circle", "breath", "calm"],
          },
          {
            id: "gardening-guild-days",
            label: "Gardening Guild Days",
            description: "Community garden workdays, seed swaps, and soil lessons.",
            tags: ["garden", "soil", "urban-farm", "plants", "community"],
          },
        ],
      },
    ],
  },
  {
    id: "grow-recharge",
    label: "Grow & Recharge",
    description: "Learning labs, career sprints, and inner work formats.",
    iconKey: "spark",
    colorToken: "violet-500",
    tags: ["learning", "career", "wellbeing"],
    children: [
      {
        id: "learning-labs",
        label: "Learning Labs",
        description: "Hands-on education for builders, analysts, and creatives.",
        iconKey: "school",
        tags: ["learning", "build", "skill"],
        children: [
          {
            id: "product-build-sprints",
            label: "Product Build Sprints",
            description: "Weekend jams for prototyping MVPs with mentors.",
            tags: ["product", "build", "sprint", "hack", "prototype"],
          },
          {
            id: "data-ai-study-halls",
            label: "Data & AI Study Halls",
            description: "Cowork style learning sessions with tutorials and office hours.",
            tags: ["data", "ai", "study", "colearn", "ml"],
          },
          {
            id: "creative-coding-jams",
            label: "Creative Coding Jams",
            description: "Generative art clubs, shaders, and audiovisual labs.",
            tags: ["creative-code", "generative", "shader", "p5", "art-tech"],
          },
        ],
      },
      {
        id: "career-finance",
        label: "Career & Finance",
        description: "Support circles for work, money, and leadership clarity.",
        iconKey: "briefcase",
        tags: ["career", "finance", "leadership"],
        children: [
          {
            id: "founder-therapy-circles",
            label: "Founder Therapy Circles",
            description: "Facilitated peer support for operators and builders.",
            tags: ["founder", "therapy", "peer", "support", "leadership"],
          },
          {
            id: "money-masterclasses",
            label: "Money Masterclasses",
            description: "Workshops on personal finance, investing, and planning.",
            tags: ["finance", "money", "invest", "budget", "planning"],
          },
          {
            id: "portfolio-critique-tables",
            label: "Portfolio Critique Tables",
            description: "Bring decks, portfolios, or reels for expert feedback.",
            tags: ["portfolio", "critique", "feedback", "design", "review"],
          },
        ],
      },
      {
        id: "wellbeing-mindset",
        label: "Wellbeing & Mindset",
        description: "Guided sessions for breath, journaling, and mental fitness.",
        iconKey: "heart",
        tags: ["wellbeing", "mindset", "recovery"],
        children: [
          {
            id: "breathwork-sessions",
            label: "Breathwork Sessions",
            description: "Facilitated breath journeys plus integration circles.",
            tags: ["breathwork", "nervous-system", "reset", "session", "wellness"],
          },
          {
            id: "journaling-club",
            label: "Journaling Club",
            description: "Prompt led writing circles with reflection decks.",
            tags: ["journal", "writing", "reflection", "prompt", "mindset"],
          },
          {
            id: "mental-fitness-labs",
            label: "Mental Fitness Labs",
            description: "Science backed mental skills practice and coaching.",
            tags: ["mental", "fitness", "resilience", "mindset", "training"],
          },
        ],
      },
    ],
  },
];

export const flattenTaxonomy = (
  taxonomy: ActivityTaxonomy = activityTaxonomy,
): ActivityTier3WithAncestors[] => {
  const flattened: ActivityTier3WithAncestors[] = [];

  taxonomy.forEach(tier1 => {
    tier1.children.forEach(tier2 => {
      tier2.children.forEach(tier3 => {
        flattened.push({
          ...tier3,
          tier2Id: tier2.id,
          tier2Label: tier2.label,
          tier1Id: tier1.id,
          tier1Label: tier1.label,
        });
      });
    });
  });

  return flattened;
};

export const buildTagLookup = (
  taxonomy: ActivityTaxonomy = activityTaxonomy,
): ActivityTagLookup => {
  const lookup: ActivityTagLookup = new Map();

  flattenTaxonomy(taxonomy).forEach(entry => {
    entry.tags.forEach(tag => {
      const normalized = tag.trim().toLowerCase();
      if (!normalized) {
        return;
      }

      if (!lookup.has(normalized)) {
        lookup.set(normalized, entry);
      }
    });
  });

  return lookup;
};

export const defaultTier3Index = flattenTaxonomy(activityTaxonomy);
export const defaultTagLookup = buildTagLookup(activityTaxonomy);

export const getTier3Category = (
  tier3Id: string,
  index: ActivityTier3WithAncestors[] = defaultTier3Index,
): ActivityTier3WithAncestors | undefined =>
  index.find(category => category.id === tier3Id);

export const resolveTagToTier3 = (
  tag: string,
  lookup: ActivityTagLookup = defaultTagLookup,
): ActivityTier3WithAncestors | undefined => lookup.get(tag.trim().toLowerCase());

export const getTier3Ids = (
  taxonomy: ActivityTaxonomy = activityTaxonomy,
): string[] => flattenTaxonomy(taxonomy).map(category => category.id);
