const base = import.meta.env.BASE_URL;

export const IMAGES = {
  // atmosphere / wide
  rig: `${base}images/hero-bg.webp`,
  water: `${base}images/service-drilling.webp`,
  // services
  drilling: `${base}images/drilling-rig.webp`,
  survey: `${base}images/survey.webp`,
  testPumping: `${base}images/test-pumping.webp`,
  pumpInstall: `${base}images/pump-install.webp`,
  purification: `${base}images/purification.webp`,
  inspection: `${base}images/inspection.webp`,
  // solar and treatment
  solarPump: `${base}images/solar-pump.webp`,
  solarTower: `${base}images/solar-tower.webp`,
  solarDiagram: `${base}images/solar-diagram.webp`,
  treatment: `${base}images/treatment-garden.webp`,
  // large, sharp photo used as a page backdrop
  backdropSolar: `${base}images/backdrops/solar-field.webp`,
  backdropRig: `${base}images/backdrops/rig-sunset.webp`,
  backdropTruck: `${base}images/backdrops/truck.webp`,
  backdropPlant: `${base}images/backdrops/ro-plant.webp`,
  backdropWater: `${base}images/backdrops/water.webp`,
};

/** Pick the right photo for a service / project by its name or type. Pass only short labels (name, type), not long descriptions. */
export function pickImage(...texts: (string | undefined | null)[]): string {
  const t = texts.filter(Boolean).join(" ").toLowerCase();
  if (/inspect|camera/.test(t)) return IMAGES.inspection;
  if (/survey|hydro|geolog|geophys/.test(t)) return IMAGES.survey;
  if (/test.?pump|pump.?test/.test(t)) return IMAGES.testPumping;
  if (/purif|treat|filter/.test(t)) return IMAGES.purification;
  if (/solar/.test(t)) return IMAGES.solarTower;
  if (/pump|install/.test(t)) return IMAGES.pumpInstall;
  if (/tank|storage|supply/.test(t)) return IMAGES.treatment;
  return IMAGES.drilling;
}

/** Where to focus when a photo is cropped, so the important part stays in view. */
const POSITIONS: Record<string, string> = {
  [IMAGES.drilling]: "center 80%", // branded truck and driller
  [IMAGES.survey]: "center 55%",
  [IMAGES.inspection]: "center 40%",
  [IMAGES.testPumping]: "center 35%",
  [IMAGES.pumpInstall]: "center 40%", // hands on the pump
  [IMAGES.purification]: "center 50%",
  [IMAGES.solarPump]: "65% 50%",
  [IMAGES.solarTower]: "center 55%",
  [IMAGES.solarDiagram]: "center 50%",
  [IMAGES.treatment]: "55% 50%",
  [IMAGES.water]: "center 40%",
};

export function imagePosition(src: string): string {
  return POSITIONS[src] ?? "center 55%";
}

/** Wide header background: the photo fills the width under a blue wash. */
export function bannerBackground(src: string, position?: string, live = true): string {
  return `linear-gradient(90deg, hsl(160 52% 10% / .94) 0%, hsl(158 54% 16% / .86) 50%, hsl(155 56% 22% / .70) 100%), ${live ? photoLayer(src) : `url(${src})`} ${position ?? imagePosition(src)} / cover`;
}

/**
 * A page photo that steps aside for the live video: while <html> has the "live-on" class, --live-photo is "none"
 * (see index.css) and the photo layer disappears. Without the video (data saver, old phone) the photo shows as before.
 */
export function photoLayer(src: string): string {
  return `var(--live-photo, url(${src}))`;
}

/** Header used when a project has no photo yet. */
export const PLAIN_BANNER = "linear-gradient(135deg, hsl(160 52% 10%) 0%, hsl(158 54% 16%) 50%, hsl(155 56% 24%) 100%)";


/** Full-width photo behind a page's content, darkened slightly so white cards on top stay easy to read. */
export function pageBackdrop(src: string, position = "center 50%") {
  return {
    backgroundColor: "var(--live-bg, hsl(160 52% 10%))",
    backgroundImage: `linear-gradient(180deg, hsl(160 52% 8% / .50) 0%, hsl(160 52% 8% / .22) 45%, hsl(160 52% 8% / .50) 100%), ${photoLayer(src)}`,
    backgroundSize: "cover",
    backgroundPosition: position,
  } as const;
}
