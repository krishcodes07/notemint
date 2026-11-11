/**
 * Mock study material dataset for Phase 4.
 *
 * NOTE: This is isolated client-side mock data representing study materials
 * for the dashboard and study workspace UI. It is NOT connected to the database
 * and will be replaced by real backend document records in Phase 5.
 */

export interface StudySection {
  title: string;
  content: string;
  subsections?: {
    subtitle: string;
    body: string;
    points?: string[];
  }[];
}

export interface StudyDocument {
  id: string;
  title: string;
  subject: string;
  classLevel: string;
  lastStudied: string;
  summary: string;
  notes: {
    overview: string;
    sections: StudySection[];
  };
  mockCounts: {
    questions: number;
    flashcards: number;
    quizQuestions: number;
  };
}

export const MOCK_STUDY_DOCUMENTS: StudyDocument[] = [
  {
    id: "life-processes",
    title: "Life Processes",
    subject: "Biology",
    classLevel: "Class 10th",
    lastStudied: "Today",
    summary:
      "Comprehensive study notes covering essential biological processes: nutrition, respiration, transportation, and excretion in living organisms.",
    notes: {
      overview:
        "All living organisms perform basic maintenance processes to prevent damage and breakdown. These maintenance functions must continue even when the organism is resting.",
      sections: [
        {
          title: "What is Life Process?",
          content:
            "The basic functions performed by living organisms to maintain their life on this earth are called life processes. The fundamental life processes common to all living organisms include Nutrition, Respiration, Transportation, Excretion, Control and Coordination, Growth, Movement, and Reproduction.",
          subsections: [
            {
              subtitle: "Maintenance Functions",
              body: "Processes that together perform the maintenance job are life processes. Since these maintenance processes are needed to prevent damage and break-down, energy is needed for them. This energy comes from outside the body of the individual organism.",
            },
          ],
        },
        {
          title: "Nutrition",
          content:
            "Nutrition is the process of intake of nutrients by an organism as well as the utilization of these nutrients by the organism. Food provides energy and materials needed for body growth, development, and repair.",
          subsections: [
            {
              subtitle: "Autotrophic Nutrition",
              body: "The process where organisms manufacture their own organic food from simple inorganic raw materials like carbon dioxide and water in the presence of sunlight and chlorophyll.",
              points: [
                "Photosynthesis equation: 6CO₂ + 12H₂O + Sunlight + Chlorophyll → C₆H₁₂O₆ + 6O₂ + 6H₂O",
                "Absorption of light energy by chlorophyll molecules",
                "Conversion of light energy to chemical energy and splitting of water molecules",
                "Reduction of carbon dioxide to carbohydrates",
              ],
            },
            {
              subtitle: "Heterotrophic Nutrition",
              body: "The process where organisms cannot manufacture their own food and depend directly or indirectly upon autotrophs for their nutritional requirements.",
              points: [
                "Holozoic nutrition: Ingestion and internal digestion of solid food (Amoeba, Humans)",
                "Saprotrophic nutrition: Feeding on dead and decaying matter (Fungi, Bacteria)",
                "Parasitic nutrition: Deriving nutrition from another living host without killing it (Cuscuta, Ticks)",
              ],
            },
          ],
        },
        {
          title: "Respiration",
          content:
            "Respiration is a biochemical catabolic process in which organic substances (principally glucose) are oxidized inside living cells to release energy in the form of ATP.",
          subsections: [
            {
              subtitle: "Aerobic Respiration",
              body: "Occurs in the presence of oxygen within the mitochondria, yielding approximately 36-38 ATP per glucose molecule, producing CO₂ and H₂O.",
            },
            {
              subtitle: "Anaerobic Respiration",
              body: "Occurs in the absence of oxygen in the cytoplasm (e.g. yeast fermentation producing ethanol + CO₂, or human muscle tissue producing lactic acid during strenuous exercise).",
            },
          ],
        },
        {
          title: "Transportation & Excretion",
          content:
            "In human beings, the circulatory system transports oxygen, nutrients, hormones, and metabolic wastes. Excretion is the biological process by which an organism removes toxic metabolic nitrogenous wastes.",
          subsections: [
            {
              subtitle: "Human Circulatory System",
              body: "Composed of the muscular four-chambered heart, blood vessels (arteries, veins, capillaries), and circulating fluid (blood and lymph).",
            },
            {
              subtitle: "Excretory System & Nephrons",
              body: "The basic filtration units of the human kidney are nephrons. Each nephron consists of a Bowman's capsule and a renal tubule for selective reabsorption of glucose, amino acids, and water.",
            },
          ],
        },
      ],
    },
    mockCounts: {
      questions: 24,
      flashcards: 18,
      quizQuestions: 15,
    },
  },
  {
    id: "acids-bases-salts",
    title: "Acids, Bases & Salts",
    subject: "Chemistry",
    classLevel: "Class 10th",
    lastStudied: "Yesterday",
    summary:
      "Chemical properties of acids, bases, pH scale indicators, neutralization reactions, and practical salts used in everyday life.",
    notes: {
      overview:
        "Substances can be classified as acids, bases, or salts according to their chemical properties and ionic behavior in aqueous solutions.",
      sections: [
        {
          title: "Properties of Acids & Bases",
          content:
            "Acids are substances that produce hydrogen ions (H⁺ or H₃O⁺) in aqueous solution and turn blue litmus red. Bases produce hydroxide ions (OH⁻) in aqueous solution, feel soapy to touch, and turn red litmus blue.",
          subsections: [
            {
              subtitle: "Indicators",
              body: "Natural indicators include litmus (lichen extract) and turmeric. Synthetic indicators include phenolphthalein (colorless in acid, pink in base) and methyl orange (red in acid, yellow in base).",
            },
          ],
        },
        {
          title: "The pH Scale & Universal Indicator",
          content:
            "The pH scale measures the hydrogen ion concentration in a solution from 0 (highly acidic) to 14 (highly alkaline), with 7 representing neutral.",
          subsections: [
            {
              subtitle: "Importance of pH in Everyday Life",
              body: "Plants and animals are pH-sensitive. Human blood works within a narrow pH range of 7.0–7.8. Stomach gastric acid (HCl) operates at pH ~1.2. Acid rain has a pH below 5.6.",
            },
          ],
        },
      ],
    },
    mockCounts: {
      questions: 18,
      flashcards: 14,
      quizQuestions: 12,
    },
  },
  {
    id: "trigonometry",
    title: "Trigonometry",
    subject: "Mathematics",
    classLevel: "Class 10th",
    lastStudied: "3 days ago",
    summary:
      "Introduction to trigonometric ratios, specific angles (0°, 30°, 45°, 60°, 90°), and fundamental trigonometric identities.",
    notes: {
      overview:
        "Trigonometry is the study of relationships between side lengths and angles of triangles, particularly right-angled triangles.",
      sections: [
        {
          title: "Trigonometric Ratios",
          content:
            "For an acute angle θ in a right triangle: sin θ = Opposite/Hypotenuse, cos θ = Adjacent/Hypotenuse, tan θ = Opposite/Adjacent.",
          subsections: [
            {
              subtitle: "Reciprocal Ratios",
              body: "cosec θ = 1/sin θ, sec θ = 1/cos θ, cot θ = 1/tan θ.",
            },
          ],
        },
        {
          title: "Fundamental Identities",
          content:
            "Key identities used to simplify expressions and prove trigonometric statements.",
          subsections: [
            {
              subtitle: "Pythagorean Identities",
              body: "sin²θ + cos²θ = 1; 1 + tan²θ = sec²θ; 1 + cot²θ = cosec²θ.",
            },
          ],
        },
      ],
    },
    mockCounts: {
      questions: 30,
      flashcards: 16,
      quizQuestions: 20,
    },
  },
  {
    id: "light",
    title: "Light",
    subject: "Physics",
    classLevel: "Class 10th",
    lastStudied: "4 days ago",
    summary:
      "Laws of reflection and refraction, spherical mirrors (concave and convex), lens formula, magnification, and power of a lens.",
    notes: {
      overview:
        "Light is an electromagnetic radiation that produces the sensation of sight in our eyes. It travels in straight lines in homogeneous media.",
      sections: [
        {
          title: "Reflection of Light & Spherical Mirrors",
          content:
            "The bouncing back of light rays into the same medium when falling on a polished surface. Laws of reflection apply to all reflecting surfaces, including spherical surfaces.",
          subsections: [
            {
              subtitle: "Mirror Formula & Magnification",
              body: "1/f = 1/v + 1/u, where f is focal length, v is image distance, and u is object distance. Magnification m = -v/u = h'/h.",
            },
          ],
        },
        {
          title: "Refraction of Light & Snell's Law",
          content:
            "The change in direction of light when it passes obliquely from one transparent medium into another. Ratio of sin i / sin r is constant for a given pair of media (Snell's Law).",
          subsections: [
            {
              subtitle: "Lens Formula & Power",
              body: "1/f = 1/v - 1/u. Power of a lens P = 1/f (in meters), measured in dioptres (D).",
            },
          ],
        },
      ],
    },
    mockCounts: {
      questions: 22,
      flashcards: 15,
      quizQuestions: 16,
    },
  },
];

export function getRecentStudies(): StudyDocument[] {
  return MOCK_STUDY_DOCUMENTS;
}

export function getStudyDocument(id: string): StudyDocument | undefined {
  return MOCK_STUDY_DOCUMENTS.find((doc) => doc.id === id);
}

