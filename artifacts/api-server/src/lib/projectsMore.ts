// Extra projects, mostly personal (homes, homesteads, small farms) with a few community-owned ones.
// Categories: Borehole Drilling, Hydrogeological Survey, Test Pumping, Pump Installation,
//             Water Purification, Borehole Inspection, Borehole Maintenance.
// Depth rules: wet western/highland 140 m minimum, coast 100-140 m, Nairobi 180-280 m, Kajiado 200 m+, other dry areas 180 m+.

type Climate = "dry" | "wet" | "highland" | "coast";
// county, region, climate, lat, lng, allowed depths (m)
const TOWNS: Record<string, [string, string, Climate, string, string, number[]]> = {
  Kasarani: ["Nairobi", "Nairobi Metropolitan", "dry", "-1.2210", "36.8980", [240, 260]],
  Embakasi: ["Nairobi", "Nairobi Metropolitan", "dry", "-1.3010", "36.9000", [230, 250]],
  Njiru: ["Nairobi", "Nairobi Metropolitan", "dry", "-1.2830", "36.9830", [240, 260]],
  Kahawa: ["Nairobi", "Nairobi Metropolitan", "dry", "-1.1850", "36.9300", [220, 240]],
  Thika: ["Kiambu", "Nairobi Metropolitan", "dry", "-1.0330", "37.0690", [200, 220]],
  Ruiru: ["Kiambu", "Nairobi Metropolitan", "dry", "-1.1466", "36.9620", [200, 220]],
  Kikuyu: ["Kiambu", "Nairobi Metropolitan", "dry", "-1.2460", "36.6630", [180, 200]],
  Ngong: ["Kajiado", "Rift Valley", "dry", "-1.3580", "36.6580", [220, 240]],
  Rongai: ["Kajiado", "Rift Valley", "dry", "-1.3960", "36.7440", [240, 260]],
  Kiserian: ["Kajiado", "Rift Valley", "dry", "-1.4220", "36.6710", [220, 240]],
  Kitengela: ["Kajiado", "Rift Valley", "dry", "-1.4730", "36.9590", [230, 250]],
  Namanga: ["Kajiado", "Rift Valley", "dry", "-2.5460", "36.7900", [240, 260]],
  Loitokitok: ["Kajiado", "Rift Valley", "dry", "-2.9130", "37.5180", [220, 240]],
  "Athi River": ["Machakos", "Eastern", "dry", "-1.4510", "36.9780", [210, 230]],
  Syokimau: ["Machakos", "Eastern", "dry", "-1.3560", "36.9330", [220, 240]],
  Machakos: ["Machakos", "Eastern", "dry", "-1.5177", "37.2634", [190, 200]],
  Wote: ["Makueni", "Eastern", "dry", "-1.7800", "37.6290", [200, 220]],
  Emali: ["Makueni", "Eastern", "dry", "-2.0810", "37.4650", [200, 210]],
  Mwingi: ["Kitui", "Eastern", "dry", "-0.9330", "38.0600", [210, 220]],
  Kitui: ["Kitui", "Eastern", "dry", "-1.3670", "38.0105", [220, 230]],
  Nakuru: ["Nakuru", "Rift Valley", "dry", "-0.3031", "36.0800", [230, 240]],
  Naivasha: ["Nakuru", "Rift Valley", "dry", "-0.7170", "36.4310", [220, 240]],
  Gilgil: ["Nakuru", "Rift Valley", "dry", "-0.4960", "36.3190", [230, 240]],
  Narok: ["Narok", "Rift Valley", "dry", "-1.0780", "35.8600", [200, 220]],
  Garissa: ["Garissa", "North Eastern", "dry", "-0.4532", "39.6461", [190, 200]],
  Nanyuki: ["Laikipia", "Central", "dry", "0.0070", "37.0720", [200, 210]],
  Kisumu: ["Kisumu", "Nyanza", "wet", "-0.1022", "34.7617", [145, 150]],
  Maseno: ["Kisumu", "Nyanza", "wet", "-0.0050", "34.6000", [150, 155]],
  "Homa Bay": ["Homa Bay", "Nyanza", "wet", "-0.5267", "34.4571", [150, 155]],
  Migori: ["Migori", "Nyanza", "wet", "-1.0634", "34.4731", [150, 160]],
  Kisii: ["Kisii", "Nyanza", "highland", "-0.6820", "34.7660", [150, 160]],
  Kakamega: ["Kakamega", "Western", "wet", "0.2827", "34.7519", [150, 160]],
  Butere: ["Kakamega", "Western", "wet", "0.2090", "34.4900", [150, 155]],
  Bungoma: ["Bungoma", "Western", "wet", "0.5635", "34.5577", [150, 155]],
  Kimilili: ["Bungoma", "Western", "wet", "0.7870", "34.7140", [150, 160]],
  Busia: ["Busia", "Western", "wet", "0.4600", "34.1120", [150, 155]],
  Vihiga: ["Vihiga", "Western", "wet", "0.0833", "34.7167", [145, 150]],
  Eldoret: ["Uasin Gishu", "Rift Valley", "highland", "0.5140", "35.2700", [170, 180]],
  Kitale: ["Trans Nzoia", "Rift Valley", "highland", "1.0153", "35.0064", [160, 170]],
  Kapsabet: ["Nandi", "Rift Valley", "highland", "0.2040", "35.1010", [150, 160]],
  Bomet: ["Bomet", "Rift Valley", "highland", "-0.7800", "35.3400", [150, 160]],
  Nyeri: ["Nyeri", "Central", "highland", "-0.4167", "36.9500", [150, 160]],
  "Murang'a": ["Murang'a", "Central", "highland", "-0.7235", "37.1547", [150, 160]],
  Kerugoya: ["Kirinyaga", "Central", "highland", "-0.4990", "37.2790", [145, 150]],
  Embu: ["Embu", "Eastern", "highland", "-0.5313", "37.4500", [150, 160]],
  Meru: ["Meru", "Eastern", "highland", "0.0469", "37.6490", [160, 170]],
  Chuka: ["Tharaka-Nithi", "Eastern", "highland", "-0.3330", "37.6500", [150, 160]],
  Malindi: ["Kilifi", "Coast", "coast", "-3.2170", "40.1290", [100, 140]],
  Watamu: ["Kilifi", "Coast", "coast", "-3.3550", "40.0230", [100, 110]],
  Kilifi: ["Kilifi", "Coast", "coast", "-3.6330", "39.8500", [120, 130]],
  Mtwapa: ["Kilifi", "Coast", "coast", "-3.9490", "39.7380", [120, 130]],
  Nyali: ["Mombasa", "Coast", "coast", "-4.0200", "39.7160", [110, 120]],
  Ukunda: ["Kwale", "Coast", "coast", "-4.2900", "39.5700", [130, 140]],
};

type Row = [town: string, noun: string, client: "Residential" | "Agricultural" | "Community"];

const CHALLENGE: Record<Climate, string[]> = {
  dry: ["Deep water and hard ground, so every metre had to count.", "A dry area where earlier boreholes nearby had failed."],
  wet: ["Water sits at different depths from one spot to the next.", "Clay and loose layers that needed careful casing."],
  highland: ["Hilly ground with water in fractured rock that is easy to miss.", "Steep access for the rig and a tight working area."],
  coast: ["Close to the sea, where salt water can creep into a borehole.", "Sandy layers that needed screens and a gravel pack."],
};

const slugify = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const pick = <T,>(a: T[], i: number) => a[i % a.length];
const owner = (c: string) => (c === "Community" ? "the community" : "the owner");
const yieldFor = (c: Climate, i: number) => pick(c === "wet" ? [5, 6, 7, 8] : c === "coast" ? [3, 4, 5] : c === "dry" ? [3, 4, 5, 6] : [4, 5, 6, 7], i);

type Out = {
  title: string; slug: string; county: string; town: string; region: string; clientType: string; serviceType: string;
  depth: number | null; yield: string | null; duration: string; completionYear: number; description: string;
  challenge: string; solution: string; outcome: string; featured: boolean; latitude: string; longitude: string;
};

function build(category: string, suffix: string, rows: Row[], make: (ctx: { town: string; noun: string; client: string; depth: number; climate: Climate; i: number }) => Partial<Out>): Out[] {
  return rows.map(([town, noun, client], i) => {
    const [county, region, climate, lat, lng, depths] = TOWNS[town];
    const depth = depths[i % depths.length];
    const title = `${town} ${noun} ${suffix}`;
    const base: Out = {
      title, slug: slugify(title), county, town, region, clientType: client, serviceType: category,
      depth, yield: null, duration: "1 day", completionYear: 2022 + ((i * 3 + town.length) % 5),
      description: "", challenge: pick(CHALLENGE[climate], i), solution: "", outcome: "", featured: false, latitude: lat, longitude: lng,
    };
    return { ...base, ...make({ town, noun, client, depth, climate, i }) };
  });
}

const DRILLING: Row[] = [
  ["Kasarani", "Family Home", "Residential"], ["Kikuyu", "Maisonette", "Residential"], ["Ruiru", "Rental Houses", "Residential"], ["Rongai", "Family Home", "Residential"],
  ["Kitengela", "Homestead", "Residential"], ["Ngong", "Smallholder Farm", "Agricultural"], ["Mwingi", "Women's Group Water Point", "Community"], ["Syokimau", "Bungalow", "Residential"],
  ["Machakos", "Retirement Home", "Residential"], ["Wote", "Village Water Point", "Community"], ["Kisumu", "Family Home", "Residential"], ["Kakamega", "Homestead", "Residential"],
  ["Bungoma", "Smallholder Farm", "Agricultural"], ["Vihiga", "Village Water Point", "Community"], ["Kisii", "Family Home", "Residential"], ["Eldoret", "Maisonette", "Residential"],
  ["Kapsabet", "Homestead", "Residential"], ["Nyeri", "Dairy Farm", "Agricultural"], ["Meru", "Family Home", "Residential"], ["Malindi", "Beach Cottage", "Residential"],
];
const SURVEYS: Row[] = [
  ["Embakasi", "Family Home", "Residential"], ["Njiru", "Residential Plot", "Residential"], ["Kahawa", "Maisonette", "Residential"], ["Thika", "Homestead", "Residential"],
  ["Kikuyu", "Family Home", "Residential"], ["Ngong", "Residential Plot", "Residential"], ["Kiserian", "Homestead", "Residential"], ["Namanga", "Homestead", "Residential"],
  ["Loitokitok", "Community Water Point", "Community"], ["Athi River", "Residential Plot", "Residential"], ["Syokimau", "Family Home", "Residential"], ["Emali", "Smallholder Farm", "Agricultural"],
  ["Kitui", "Homestead", "Residential"], ["Narok", "Smallholder Farm", "Agricultural"], ["Gilgil", "Smallholder Farm", "Agricultural"], ["Nakuru", "Family Home", "Residential"],
  ["Garissa", "Community Water Point", "Community"], ["Nanyuki", "Family Home", "Residential"], ["Maseno", "Homestead", "Residential"], ["Butere", "Women's Group Farm", "Community"],
  ["Kimilili", "Homestead", "Residential"], ["Homa Bay", "Family Home", "Residential"], ["Migori", "Homestead", "Residential"], ["Kitale", "Smallholder Farm", "Agricultural"],
  ["Bomet", "Family Home", "Residential"], ["Murang'a", "Homestead", "Residential"], ["Kerugoya", "Family Home", "Residential"], ["Chuka", "Homestead", "Residential"],
  ["Watamu", "Beach Cottage", "Residential"], ["Busia", "Residential Plot", "Residential"],
];
const TESTS: Row[] = [
  ["Kikuyu", "Family Home", "Residential"], ["Rongai", "Homestead", "Residential"], ["Kitengela", "Maisonette", "Residential"], ["Machakos", "Smallholder Farm", "Agricultural"],
  ["Kisumu", "Family Home", "Residential"], ["Kakamega", "Homestead", "Residential"], ["Eldoret", "Maisonette", "Residential"], ["Nyeri", "Dairy Farm", "Agricultural"],
  ["Mwingi", "Village Water Point", "Community"], ["Malindi", "Beach Cottage", "Residential"],
];
const PUMPS: Row[] = [
  ["Kasarani", "Family Home", "Residential"], ["Thika", "Homestead", "Residential"], ["Ngong", "Smallholder Farm", "Agricultural"], ["Syokimau", "Bungalow", "Residential"],
  ["Kisii", "Family Home", "Residential"], ["Bungoma", "Homestead", "Residential"], ["Kitale", "Smallholder Farm", "Agricultural"], ["Meru", "Family Home", "Residential"],
  ["Vihiga", "Village Water Point", "Community"], ["Mtwapa", "Maisonette", "Residential"],
];
const PURIFY: Row[] = [
  ["Embakasi", "Family Home", "Residential"], ["Kikuyu", "Maisonette", "Residential"], ["Rongai", "Homestead", "Residential"], ["Kitengela", "Rental Houses", "Residential"],
  ["Kisumu", "Family Home", "Residential"], ["Nyali", "Maisonette", "Residential"], ["Malindi", "Beach Cottage", "Residential"], ["Machakos", "Homestead", "Residential"],
  ["Eldoret", "Family Home", "Residential"], ["Mwingi", "Village Water Point", "Community"],
];
const CAMERA: Row[] = [
  ["Kasarani", "Family Home", "Residential"], ["Kitengela", "Homestead", "Residential"], ["Kisumu", "Family Home", "Residential"], ["Nakuru", "Smallholder Farm", "Agricultural"],
  ["Machakos", "Homestead", "Residential"],
];
const MAINT: Row[] = [
  ["Kikuyu", "Family Home", "Residential"], ["Ruiru", "Homestead", "Residential"], ["Rongai", "Family Home", "Residential"], ["Athi River", "Smallholder Farm", "Agricultural"],
  ["Naivasha", "Homestead", "Residential"], ["Kisumu", "Family Home", "Residential"], ["Kakamega", "Homestead", "Residential"], ["Nyeri", "Dairy Farm", "Agricultural"],
  ["Wote", "Village Water Point", "Community"], ["Kilifi", "Beach Cottage", "Residential"],
];

const T = {
  drill: ["Drilled and cased a {depth}m borehole for a {noun} in {town}.", "A new {depth}m borehole for a {noun} in {town}, drilled, cased and developed.", "{town} {noun}: a {depth}m cased and gravel-packed borehole."],
  survey: ["Hydrogeological survey for a {noun} in {town} to find the best borehole point before drilling.", "Geophysical survey of a {noun} plot in {town} with a recommended drilling depth.", "Water survey for a {noun} in {town} so {who} would not drill a dry hole."],
  test: ["24-hour pump test and water sample for a {noun} borehole in {town}.", "Test pumping on a {noun} borehole in {town} to confirm its safe yield.", "Pump test for a {noun} in {town}, with readings and a written report."],
  pump: ["Pump, pipework and pressure tank installed for a {noun} in {town}.", "New submersible pump for a {noun} in {town}, sized to the borehole.", "Pump installation for a {noun} in {town} with a tank and control panel."],
  purify: ["Water treatment system installed for a {noun} in {town}.", "Filtration and treatment for a {noun} in {town}, matched to the water test.", "Clean-water treatment for a {noun} in {town}."],
  camera: ["Camera inspection of the borehole at a {noun} in {town}.", "Borehole camera check for a {noun} in {town} with a video recording.", "Down-hole camera survey of a {noun} borehole in {town}."],
  maint: ["Borehole cleaning and servicing for a {noun} in {town}.", "Maintenance on a {noun} borehole in {town} that had lost yield.", "Borehole redevelopment and pump servicing for a {noun} in {town}."],
};
const fill = (s: string, c: { town: string; noun: string; depth: number; client: string }) =>
  s.replace(/\{town\}/g, c.town).replace(/\{noun\}/g, c.noun.toLowerCase()).replace(/\{depth\}/g, String(c.depth)).replace(/\{who\}/g, owner(c.client));

export const MORE_PROJECTS: Out[] = [
  ...build("Borehole Drilling", "Borehole", DRILLING, (c) => ({
    yield: `${yieldFor(c.climate, c.i)} m³/hr`, duration: `${4 + (c.i % 4)} days`,
    description: fill(pick(T.drill, c.i), c),
    solution: `Drilled to ${c.depth}m, fitted with casing and screens, gravel-packed and flushed until the water ran clear.`,
    outcome: c.client === "Community" ? "Families now fetch clean water close to home." : "Reliable private water, with no more tanker deliveries.",
  })),
  ...build("Hydrogeological Survey", "Survey", SURVEYS, (c) => ({
    yield: `Est. ${yieldFor(c.climate, c.i)} m³/hr`,
    description: fill(pick(T.survey, c.i), c),
    solution: `ADMT-300S-X geophysical scan of ${2 + (c.i % 3)} candidate points. The best zone was marked, with a recommended depth of ${c.depth}m.`,
    outcome: pick(["Drill point, depth and report handed over before any drilling money was spent.", "The owner drilled at the marked point and avoided a dry hole.", "Report supported the WARMA permit application."], c.i),
  })),
  ...build("Test Pumping", "Pump Test", TESTS, (c) => ({
    yield: `${yieldFor(c.climate, c.i) + 1} m³/hr`, duration: "2 days",
    description: fill(pick(T.test, c.i), c),
    solution: "Step test, then a 24-hour constant-rate test with recovery readings. A water sample went to an accredited lab.",
    outcome: "Safe pumping rate and pump setting confirmed, and the report supported the permit.",
  })),
  ...build("Pump Installation", "Pump Installation", PUMPS, (c) => ({
    yield: `${yieldFor(c.climate, c.i)} m³/hr`,
    description: fill(pick(T.pump, c.i), c),
    solution: `Pump sized for the ${c.depth}m borehole, new rising main, control panel and a pressure tank or raised tank.`,
    outcome: "Steady water at every tap, and a pump that runs within its safe range.",
  })),
  ...build("Water Purification", "Water Treatment", PURIFY, (c) => ({
    depth: null, yield: pick(["500 L/hr", "1,000 L/hr", "800 L/hr", "1,500 L/hr"], c.i), duration: "2 days",
    description: fill(pick(T.purify, c.i), c),
    challenge: c.climate === "coast" ? "Salty, hard water that stained taps and tasted bad." : pick(["Hard water that scaled pipes and heaters.", "Water that tested positive for bacteria.", "Muddy, rusty water from the borehole."], c.i),
    solution: pick(["Sand and carbon filtration with a UV steriliser.", "Water softener with filtration.", "Reverse osmosis unit with pre-filters and a storage tank.", "Filtration and UV sterilisation on the main line."], c.i),
    outcome: "Clean, safe water from the tap, and a simple servicing plan.",
  })),
  ...build("Borehole Inspection", "Borehole Camera Inspection", CAMERA, (c) => ({
    yield: "Video report", duration: "Half day",
    description: fill(pick(T.camera, c.i), c),
    solution: "Camera lowered down the borehole to check the casing, screens, true depth and where water enters.",
    outcome: pick(["Found a blocked screen section, which was then cleaned.", "Casing confirmed in good condition, with a video recording kept.", "True depth and water entry points confirmed before choosing a pump."], c.i),
  })),
  ...build("Borehole Maintenance", "Borehole Maintenance", MAINT, (c) => {
    const before = 1 + (c.i % 3);
    return {
      yield: `${before} → ${before + 3} m³/hr`, duration: "1 day",
      description: fill(pick(T.maint, c.i), c),
      challenge: "Yield had dropped over the years from silt and clogged screens.",
      solution: pick(["Pump pulled, borehole brushed, flushed and air-lifted, then the pump refitted.", "Screens cleaned, borehole redeveloped and the pump serviced with worn parts replaced."], c.i),
      outcome: `Yield recovered from about ${before} to ${before + 3} m³/hr.`,
    };
  }),
];
