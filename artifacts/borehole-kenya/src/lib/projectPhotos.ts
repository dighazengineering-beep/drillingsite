import { IMAGES } from "@/lib/images";

const base = import.meta.env.BASE_URL;
const p = (name: string) => `${base}images/projects/${name}.webp`;

export interface ProjectPhoto {
  src: string;
  /** CSS object-position so the important part stays in frame */
  pos: string;
}

const photo = (src: string, pos = "center 50%"): ProjectPhoto => ({ src, pos });

/**
 * One photo per project, matched by project title, and chosen to make sense for the project:
 *  - community / farm / estate drilling jobs  -> drilling rigs
 *  - hospitals, hotels, resorts, factories    -> purification, treatment plants, tanks
 *  - irrigation and livestock water           -> solar pumps, flowing water, tank towers
 * No photo is used twice.
 * To change one: drop the file in public/images/projects and edit the line below.
 */
const PHOTOS: Record<string, ProjectPhoto> = {
  // --- drilling ---
  "karura forest community borehole": photo(p("karura"), "center 82%"),
  "ruiru industrial estate water supply": photo(p("ruiru")),
  "kilifi community water project": photo(p("kilifi"), "center 92%"),
  "malindi fishermen's cooperative borehole": photo(p("diani")), // palm trees, coastal
  "nakuru dairy farm mega borehole": photo(p("nakuru-dairy"), "center 55%"),
  "naivasha horticulture farm water system": photo(p("naivasha")),
  "kericho school cluster water": photo(p("kericho")),
  "siaya community water project": photo(p("siaya"), "center 0%"),
  "kitui arid lands community water": photo(p("kitui"), "center 35%"),
  "embu private college water supply": photo(p("embu"), "center 62%"),
  "garissa settlement emergency water": photo(IMAGES.pumpInstall, "center 40%"), // dry, sandy
  "isiolo town water supply augmentation": photo(p("isiolo"), "center 40%"),
  "nyeri county coffee cooperative": photo(p("nyeri")),
  "taita-taveta sisal estate": photo(`${base}images/drill-crew.webp`, "center 55%"),
  "nandi hills tea estate water supply": photo(p("nandi")),
  "vihiga dispensary water supply": photo(p("vihiga"), "center 38%"),
  "nyamira tea factory water supply": photo(p("garissa"), "center 55%"), // green tea hills
  "marsabit camel market water point": photo(p("marsabit")),

  // --- hospitals, resorts, hotels, factories, malls: clean water and storage ---
  "diani beach resort desalination & borehole": photo(p("ro-plant")), // reverse osmosis plant
  "mombasa airport road hotel complex": photo(IMAGES.treatment, "55% 50%"), // hotel garden, tanks and filters
  "eldoret private hospital borehole": photo(p("ro-clean-room"), "center 38%"),
  "meru private hospital water supply": photo(p("ro-plant-industrial"), "center 55%"),
  "kisumu port industrial zone": photo(p("solar-towers-urban"), "center 62%"), // solar with large storage tanks
  "homa bay fish processing plant": photo(IMAGES.water, "center 40%"),
  "murang'a avocado packing station": photo(IMAGES.purification),
  "bungoma town shopping mall": photo(p("tank-lift"), "center 30%"),
  "samburu safari camp water": photo(IMAGES.solarTower, "center 55%"), // dry savanna, off-grid solar

  // --- irrigation and livestock: pumps, flowing water, tank towers ---
  "ngong hills flower farm irrigation": photo(p("pump-discharge")), // savanna
  "bomet tea estate irrigation network": photo(p("tank-tower-panel"), "center 15%"), // green highlands
  "kakamega sugar cane cooperative": photo(IMAGES.solarPump, "65% 50%"), // lush lowland
  "machakos mango farm irrigation": photo(p("solar-tank-tap"), "center 25%"),
  "kirinyaga rice farmers irrigation": photo(p("solar-field-pump"), "center 45%"), // hot lowland, palms
  "trans nzoia wheat farm irrigation": photo(p("tank-tower-two"), "center 15%"),
  "turkana livestock trough network": photo(p("water-jet-pipe"), "center 25%"), // arid
  "laikipia wildlife conservancy": photo(p("eldoret"), "center 52%"), // open grassland

  // --- real survey photos ---
  "kajiado ranch hydrogeological survey": photo(p("svy-kajiado-ranch"), "center 50%"),
  "machakos school water survey": photo(p("svy-machakos-school"), "center 55%"),
  "kakamega forest edge farm survey": photo(p("svy-kakamega-forest-edge"), "center 75%"),
  "garissa community water point survey": photo(p("svy-garissa-survey"), "center 40%"),
  "kericho tea farm survey": photo(p("svy-kericho-tea-survey"), "center 45%"),
  "kisumu lakeside homestead survey": photo(p("svy-kisumu-lakeside"), "center 40%"),
  "namanga homestead survey": photo(p("svy-namanga-survey"), "center 40%"),
  "eldoret residential estate survey": photo(p("svy-eldoret-estate-survey"), "center 55%"),
  "limuru farm water survey": photo(p("svy-limuru-farm-survey"), "center 45%"),
  "njoro dairy farm survey": photo(p("svy-njoro-dairy-survey"), "center 70%"),
  "magadi road community survey": photo(p("svy-magadi-road-survey"), "center 55%"),
  "loitokitok community water point survey": photo(p("svy-loitokitok-survey"), "center 50%"),

  // --- added projects (spare photos first; general service photos are shared until more are supplied) ---

  "karen residential estate survey": photo(IMAGES.survey, "center 62%"),


  "malindi beachfront plots survey": photo(IMAGES.survey, "center 50%"),

  "ruai estate borehole pump test": photo(IMAGES.testPumping, "center 35%"),
  "kitengela factory borehole test pumping": photo(IMAGES.testPumping, "center 60%"),
  "kisii hotel borehole pump test": photo(IMAGES.testPumping, "center 15%"),
  "athi river warehouse pump test": photo(IMAGES.testPumping, "center 80%"),
  "malindi resort borehole pump test": photo(IMAGES.testPumping, "center 48%"),
  "kiambu school uv and filtration system": photo(IMAGES.purification, "center 50%"),
  "nakuru bottled water plant ro system": photo(p("ro-plant-industrial"), "center 55%"),
  "kilifi clinic water treatment": photo(p("ro-clean-room"), "center 38%"),
  "kitui dispensary salinity reduction": photo(IMAGES.purification, "center 70%"),
  "nairobi apartments softener and filtration": photo(p("ro-plant"), "center 50%"),
  "runda residence pump installation": photo(IMAGES.pumpInstall, "center 40%"),
  "kakamega town hotel pump upgrade": photo(p("tank-lift"), "center 30%"),
  "kajiado dairy pump and pressure system": photo(p("pump-discharge"), "center 50%"),
  "kisumu estate booster and tank system": photo(p("tank-tower-two"), "center 15%"),
  "kitengela estate full borehole package": photo(`${base}images/backdrops/rig-sunset.webp`, "center 55%"),
  "kakamega farm full package": photo(`${base}images/backdrops/truck.webp`, "center 45%"),
  "malindi beach hotel full package": photo(p("malindi"), "center 40%"),
  "thika poultry farm borehole and pump": photo(IMAGES.drilling, "center 80%"),
  "kisumu primary school borehole and pump": photo(IMAGES.drilling, "center 55%"),
  "kajiado maasai community water point": photo(p("meru"), "center 50%"),
  "syokimau residential borehole": photo(p("kisumu-port"), "center 50%"),
};

/** Stand-in photos by category for projects that have no photo of their own yet. Replace by adding the project to PHOTOS above. */
const FALLBACK_BY_TYPE: Record<string, ProjectPhoto> = {
  "Hydrogeological Survey": photo(IMAGES.survey, "center 50%"),
  "Test Pumping": photo(IMAGES.testPumping, "center 35%"),
  "Water Purification": photo(IMAGES.purification, "center 50%"),
  "Pump Installation": photo(IMAGES.pumpInstall, "center 40%"),
  "Drilling & Pump": photo(IMAGES.drilling, "center 80%"),
  "Borehole Drilling": photo(IMAGES.drilling, "center 80%"),
  "Full Package": photo(IMAGES.drilling, "center 80%"),
  "Borehole Inspection": photo(IMAGES.inspection, "center 40%"),
  "Borehole Maintenance": photo(IMAGES.pumpInstall, "center 40%"),
};

export function projectPhoto(title: string | undefined | null, serviceType?: string | null): ProjectPhoto | undefined {
  if (!title) return undefined;
  return PHOTOS[title.trim().toLowerCase()] ?? (serviceType ? FALLBACK_BY_TYPE[serviceType] : undefined);
}

/* ---------------------------------------------------------------------------
 * Page backdrop for each project's detail page (the area below the header).
 * A different photo from the header, chosen to fit the project's place and type:
 *   rig-sunset  dry savanna / semi-arid areas
 *   truck       green highland farm and estate areas
 *   survey      lush green western and tea areas
 *   solar-field green irrigated farms and solar projects
 *   water       general water supply
 *   ro-plant    hospitals, hotels, factories, packing plants
 *   purification clean-water rooms
 * Only large, sharp photos are used here so they never look blurry.
 * ------------------------------------------------------------------------- */
const BACKDROPS = {
  "rig-sunset": { src: `${base}images/backdrops/rig-sunset.webp`, pos: "center 55%" },
  truck: { src: `${base}images/backdrops/truck.webp`, pos: "center 45%" },
  survey: { src: `${base}images/backdrops/survey.webp`, pos: "center 55%" },
  "solar-field": { src: `${base}images/backdrops/solar-field.webp`, pos: "center 50%" },
  water: { src: `${base}images/backdrops/water.webp`, pos: "center 40%" },
  "ro-plant": { src: `${base}images/backdrops/ro-plant.webp`, pos: "center 50%" },
  purification: { src: `${base}images/backdrops/purification.webp`, pos: "center 50%" },
} as const;

type BackdropKey = keyof typeof BACKDROPS;

const BACKDROP_FOR: Record<string, BackdropKey> = {
  "karura forest community borehole": "survey",
  "ruiru industrial estate water supply": "truck",
  "ngong hills flower farm irrigation": "solar-field",
  "diani beach resort desalination & borehole": "purification",
  "kilifi community water project": "water",
  "malindi fishermen's cooperative borehole": "water",
  "mombasa airport road hotel complex": "ro-plant",
  "nakuru dairy farm mega borehole": "truck",
  "eldoret private hospital borehole": "ro-plant",
  "bomet tea estate irrigation network": "solar-field",
  "naivasha horticulture farm water system": "truck",
  "kericho school cluster water": "survey",
  "kisumu port industrial zone": "solar-field",
  "kakamega sugar cane cooperative": "solar-field",
  "bungoma town shopping mall": "water",
  "siaya community water project": "survey",
  "machakos mango farm irrigation": "rig-sunset",
  "kitui arid lands community water": "rig-sunset",
  "meru private hospital water supply": "ro-plant",
  "embu private college water supply": "truck",
  "garissa settlement emergency water": "rig-sunset",
  "turkana livestock trough network": "rig-sunset",
  "isiolo town water supply augmentation": "rig-sunset",
  "nyeri county coffee cooperative": "truck",
  "kirinyaga rice farmers irrigation": "solar-field",
  "murang'a avocado packing station": "ro-plant",
  "laikipia wildlife conservancy": "rig-sunset",
  "taita-taveta sisal estate": "rig-sunset",
  "nandi hills tea estate water supply": "survey",
  "vihiga dispensary water supply": "survey",
  "trans nzoia wheat farm irrigation": "solar-field",
  "homa bay fish processing plant": "ro-plant",
  "samburu safari camp water": "rig-sunset",
  "nyamira tea factory water supply": "purification",
  "marsabit camel market water point": "rig-sunset",

  "kajiado ranch hydrogeological survey": "rig-sunset",
  "karen residential estate survey": "truck",
  "kisumu lakeside homestead survey": "survey",
  "kakamega forest edge farm survey": "survey",
  "malindi beachfront plots survey": "water",
  "machakos school water survey": "rig-sunset",
  "ruai estate borehole pump test": "truck",
  "kitengela factory borehole test pumping": "rig-sunset",
  "kisii hotel borehole pump test": "survey",
  "athi river warehouse pump test": "rig-sunset",
  "malindi resort borehole pump test": "water",
  "kiambu school uv and filtration system": "purification",
  "nakuru bottled water plant ro system": "ro-plant",
  "kilifi clinic water treatment": "purification",
  "kitui dispensary salinity reduction": "purification",
  "nairobi apartments softener and filtration": "ro-plant",
  "runda residence pump installation": "truck",
  "kakamega town hotel pump upgrade": "solar-field",
  "kajiado dairy pump and pressure system": "rig-sunset",
  "kisumu estate booster and tank system": "solar-field",
  "kitengela estate full borehole package": "rig-sunset",
  "kakamega farm full package": "solar-field",
  "malindi beach hotel full package": "water",
  "thika poultry farm borehole and pump": "truck",
  "kisumu primary school borehole and pump": "survey",
  "kajiado maasai community water point": "rig-sunset",
  "syokimau residential borehole": "rig-sunset",
};

const BACKDROP_BY_TYPE: Record<string, BackdropKey> = {
  "Hydrogeological Survey": "survey",
  "Test Pumping": "water",
  "Water Purification": "purification",
  "Pump Installation": "water",
  "Drilling & Pump": "truck",
  "Borehole Drilling": "rig-sunset",
  "Full Package": "rig-sunset",
  "Borehole Inspection": "water",
  "Borehole Maintenance": "water",
};

export function projectBackdrop(title: string | undefined | null, serviceType?: string | null): ProjectPhoto | undefined {
  if (!title) return undefined;
  const key = BACKDROP_FOR[title.trim().toLowerCase()] ?? (serviceType ? BACKDROP_BY_TYPE[serviceType] : undefined);
  return key ? BACKDROPS[key] : undefined;
}
