// Project categories (serviceType):
//   Hydrogeological Survey | Borehole Drilling | Pump Installation | Test Pumping
//   Water Purification | Drilling & Pump | Full Package (survey + drilling + pump)
//
// Depth rules used for realism:
//   wet western / highland areas (Kisumu, Kakamega, Kisii ...)  140 m minimum
//   coast (Malindi, Kilifi, Kwale, Mombasa)                     100 - 140 m
//   dry areas: Nairobi 180 - 280 m, Kajiado 200 m and above, Machakos / Kitui / north 180 m and above

type NewProject = {
  title: string; slug: string; county: string; town: string; region: string;
  clientType: string; serviceType: string; depth: number | null; yield: string | null;
  duration: string; completionYear: number; description: string;
  challenge: string; solution: string; outcome: string; featured: boolean;
  latitude: string; longitude: string;
};

/** Changes to projects already in the database. Applied only while the depth still has its old value. */
export const PROJECT_UPDATES: {
  slug: string; oldDepth: number; depth: number; serviceType: string;
  replace?: Partial<Record<"description" | "challenge" | "solution" | "outcome", [string, string]>>;
}[] = [
  { slug: "karura-forest-community-borehole", oldDepth: 120, depth: 240, serviceType: "Full Package", replace: { description: ["Drilled a 120m", "Surveyed, drilled (240m) and equipped a"] } },
  { slug: "ruiru-industrial-estate", oldDepth: 180, depth: 260, serviceType: "Full Package", replace: { solution: ["aquifer at 145m depth", "aquifer at 235m depth"] } },
  { slug: "ngong-hills-flower-farm", oldDepth: 95, depth: 220, serviceType: "Drilling & Pump" },
  { slug: "diani-beach-resort-borehole", oldDepth: 200, depth: 140, serviceType: "Water Purification", replace: { description: ["Drilled a 200m coastal borehole", "Drilled a 140m coastal borehole"] } },
  { slug: "kilifi-county-water-project", oldDepth: 160, depth: 130, serviceType: "Borehole Drilling" },
  { slug: "malindi-fishermen-cooperative", oldDepth: 80, depth: 100, serviceType: "Borehole Drilling" },
  { slug: "mombasa-airport-road-hotel", oldDepth: 145, depth: 120, serviceType: "Pump Installation" },
  { slug: "nakuru-dairy-farm-mega-borehole", oldDepth: 110, depth: 220, serviceType: "Drilling & Pump" },
  { slug: "eldoret-teaching-hospital", oldDepth: 195, depth: 195, serviceType: "Full Package" },
  { slug: "bomet-tea-estate-irrigation", oldDepth: 88, depth: 150, serviceType: "Drilling & Pump" },
  { slug: "naivasha-horticulture-farm", oldDepth: 72, depth: 200, serviceType: "Borehole Drilling", replace: { solution: ["drilled to 72m", "drilled to 200m"] } },
  { slug: "kericho-school-cluster", oldDepth: 105, depth: 150, serviceType: "Borehole Drilling", replace: { solution: ["aquifer at 95m depth", "aquifer at 140m depth"] } },
  { slug: "kisumu-port-industrial-zone", oldDepth: 130, depth: 150, serviceType: "Borehole Drilling" },
  { slug: "kakamega-sugarcane-cooperative", oldDepth: 85, depth: 150, serviceType: "Drilling & Pump" },
  { slug: "bungoma-town-shopping-mall", oldDepth: 115, depth: 145, serviceType: "Pump Installation" },
  { slug: "siaya-county-water-authority", oldDepth: 145, depth: 145, serviceType: "Borehole Drilling" },
  { slug: "machakos-mango-farm-irrigation", oldDepth: 135, depth: 180, serviceType: "Drilling & Pump" },
  { slug: "kitui-arid-lands-community-water", oldDepth: 220, depth: 220, serviceType: "Borehole Drilling" },
  { slug: "meru-county-referral-hospital", oldDepth: 160, depth: 160, serviceType: "Full Package" },
  { slug: "embu-university-college-water-supply", oldDepth: 140, depth: 140, serviceType: "Borehole Drilling" },
  { slug: "garissa-refugee-camp-emergency-water", oldDepth: 90, depth: 180, serviceType: "Borehole Drilling" },
  { slug: "turkana-livestock-trough-network", oldDepth: 75, depth: 180, serviceType: "Drilling & Pump" },
  { slug: "isiolo-town-water-supply", oldDepth: 168, depth: 168, serviceType: "Borehole Drilling" },
  { slug: "nyeri-coffee-cooperative-borehole", oldDepth: 100, depth: 150, serviceType: "Borehole Drilling" },
  { slug: "kirinyaga-rice-irrigation-scheme", oldDepth: 55, depth: 145, serviceType: "Drilling & Pump" },
  { slug: "muranga-avocado-packing-station", oldDepth: 90, depth: 150, serviceType: "Pump Installation" },
  { slug: "laikipia-wildlife-conservancy-borehole", oldDepth: 130, depth: 190, serviceType: "Drilling & Pump" },
  { slug: "taita-taveta-sisal-estate", oldDepth: 175, depth: 175, serviceType: "Borehole Drilling" },
  { slug: "nandi-hills-tea-research-station", oldDepth: 95, depth: 150, serviceType: "Borehole Drilling" },
  { slug: "vihiga-county-health-facilities", oldDepth: 100, depth: 145, serviceType: "Borehole Drilling" },
  { slug: "trans-nzoia-wheat-farm-irrigation", oldDepth: 80, depth: 160, serviceType: "Drilling & Pump" },
  { slug: "homa-bay-fish-processing-plant", oldDepth: 110, depth: 150, serviceType: "Borehole Drilling" },
  { slug: "samburu-national-reserve-camp", oldDepth: 85, depth: 180, serviceType: "Drilling & Pump" },
  { slug: "nyamira-tea-factory-water-supply", oldDepth: 95, depth: 145, serviceType: "Borehole Drilling", replace: { solution: ["at 85m depth", "at 140m depth"] } },
  { slug: "marsabit-camel-market-water-point", oldDepth: 105, depth: 180, serviceType: "Borehole Drilling", replace: { solution: ["at 95m depth", "at 170m depth"] } },
];

const P = (p: NewProject): NewProject => p;

export const NEW_PROJECTS: NewProject[] = [
  // ---------------- Hydrogeological surveys ----------------
  P({ title: "Kajiado Ranch Hydrogeological Survey", slug: "kajiado-ranch-survey", county: "Kajiado", town: "Kajiado", region: "Rift Valley", clientType: "Agricultural", serviceType: "Hydrogeological Survey", depth: 220, yield: "Est. 5 m³/hr", duration: "1 day", completionYear: 2025,
    description: "Hydrogeological survey for a cattle ranch to find the best borehole point before any drilling money was spent.",
    challenge: "Dry ground with deep water. The owner had a failed borehole on another part of the ranch.",
    solution: "ADMT-300S-X geophysical scan across three candidate sites. The best fracture zone was marked, with a recommended depth of 220m.",
    outcome: "Report and drill point handed over, with the WARMA permit paperwork ready to file.", featured: false, latitude: "-1.8520", longitude: "36.7820" }),
  P({ title: "Karen Residential Estate Survey", slug: "karen-estate-survey", county: "Nairobi", town: "Karen", region: "Nairobi Metropolitan", clientType: "Residential", serviceType: "Hydrogeological Survey", depth: 260, yield: "Est. 4 m³/hr", duration: "1 day", completionYear: 2025,
    description: "Survey for a gated estate that wanted its own water instead of buying tanker water.",
    challenge: "Many boreholes already nearby, so the aquifer is crowded and deep.",
    solution: "Geophysical scan to avoid the interference zone, with a safe drilling depth of 260m recommended.",
    outcome: "The estate drilled at the marked point and avoided a dry hole.", featured: false, latitude: "-1.3190", longitude: "36.7070" }),
  P({ title: "Kisumu Lakeside Homestead Survey", slug: "kisumu-lakeside-survey", county: "Kisumu", town: "Kisumu", region: "Nyanza", clientType: "Residential", serviceType: "Hydrogeological Survey", depth: 150, yield: "Est. 6 m³/hr", duration: "1 day", completionYear: 2024,
    description: "Survey for a family homestead near the lake who wanted safe borehole water for the household and a small kitchen garden.",
    challenge: "Shallow water near the lake can be poor quality, so the aim was a deeper, cleaner aquifer.",
    solution: "Scan found a clean water-bearing layer, with a recommended borehole depth of 150m.",
    outcome: "Clear drill point and depth given before the family committed to drilling.", featured: false, latitude: "-0.0917", longitude: "34.7680" }),
  P({ title: "Kakamega Forest Edge Farm Survey", slug: "kakamega-farm-survey", county: "Kakamega", town: "Kakamega", region: "Western", clientType: "Agricultural", serviceType: "Hydrogeological Survey", depth: 160, yield: "Est. 7 m³/hr", duration: "1 day", completionYear: 2025,
    description: "Survey for a farm on the edge of Kakamega forest planning dairy and vegetable irrigation.",
    challenge: "Green, hilly land with water at different depths from one spot to the next.",
    solution: "Two sites scanned, the stronger one marked, with a recommended depth of 160m.",
    outcome: "The farmer picked the better site and the report supported the permit application.", featured: false, latitude: "0.2830", longitude: "34.7520" }),
  P({ title: "Malindi Beachfront Plots Survey", slug: "malindi-plots-survey", county: "Kilifi", town: "Malindi", region: "Coast", clientType: "Residential", serviceType: "Hydrogeological Survey", depth: 100, yield: "Est. 3 m³/hr", duration: "1 day", completionYear: 2024,
    description: "Survey for several coastal plots checking where fresh water can be found without hitting salty water.",
    challenge: "Near the sea, a wrongly sited borehole pulls in salt water.",
    solution: "Scan kept the drill points inland of the salty zone, with a target depth of 100m.",
    outcome: "Each plot got its own marked point and depth.", featured: false, latitude: "-3.2190", longitude: "40.1170" }),
  P({ title: "Machakos School Water Survey", slug: "machakos-school-survey", county: "Machakos", town: "Machakos", region: "Eastern", clientType: "Education", serviceType: "Hydrogeological Survey", depth: 190, yield: "Est. 4 m³/hr", duration: "1 day", completionYear: 2025,
    description: "Survey for a boarding school that lost water every dry season.",
    challenge: "Dry hills and an earlier borehole that ran dry.",
    solution: "Scan found a fracture zone away from the old borehole, with a recommended depth of 190m.",
    outcome: "School received a drill point, depth and report for the drilling tender.", featured: false, latitude: "-1.5170", longitude: "37.2640" }),

  // ---------------- Test pumping ----------------
  P({ title: "Ruai Estate Borehole Pump Test", slug: "ruai-estate-pump-test", county: "Nairobi", town: "Ruai", region: "Nairobi Metropolitan", clientType: "Residential", serviceType: "Test Pumping", depth: 250, yield: "9 m³/hr", duration: "2 days", completionYear: 2025,
    description: "24-hour pump test on an existing estate borehole to confirm its real, safe yield.",
    challenge: "The estate was unsure if the borehole could supply all the houses.",
    solution: "Full 24-hour test with water level readings, followed by a water sample sent to an accredited lab.",
    outcome: "Safe yield and pump setting confirmed, and the test report supported the permit.", featured: false, latitude: "-1.2750", longitude: "36.9710" }),
  P({ title: "Kitengela Factory Borehole Test Pumping", slug: "kitengela-factory-pump-test", county: "Kajiado", town: "Kitengela", region: "Rift Valley", clientType: "Commercial", serviceType: "Test Pumping", depth: 230, yield: "12 m³/hr", duration: "2 days", completionYear: 2024,
    description: "Pump test for a factory borehole drilled by another company, as part of the permit process.",
    challenge: "Factory needed proof of yield before buying a large pump.",
    solution: "24-hour constant-rate test and recovery readings, with water analysis.",
    outcome: "Correct pump size chosen from real figures.", featured: false, latitude: "-1.4750", longitude: "36.9600" }),
  P({ title: "Kisii Hotel Borehole Pump Test", slug: "kisii-hotel-pump-test", county: "Kisii", town: "Kisii", region: "Nyanza", clientType: "Hospitality", serviceType: "Test Pumping", depth: 150, yield: "7 m³/hr", duration: "2 days", completionYear: 2025,
    description: "24-hour pump test and water analysis for a hotel before it was connected to the guest rooms.",
    challenge: "The hotel needed to know it could meet peak demand during events.",
    solution: "Step and 24-hour tests, with a water quality report to guide treatment.",
    outcome: "Yield confirmed and a UV treatment recommendation given.", featured: false, latitude: "-0.6770", longitude: "34.7790" }),
  P({ title: "Athi River Warehouse Pump Test", slug: "athi-river-warehouse-pump-test", county: "Machakos", town: "Athi River", region: "Eastern", clientType: "Commercial", serviceType: "Test Pumping", depth: 210, yield: "6 m³/hr", duration: "2 days", completionYear: 2024,
    description: "Pump test on a warehouse borehole that was losing water level during the day.",
    challenge: "The pump kept running dry in the afternoons.",
    solution: "Long test showed the borehole needed a lower pump setting and shorter pumping hours.",
    outcome: "Pump reset and a safe daily pumping schedule agreed.", featured: false, latitude: "-1.4510", longitude: "36.9780" }),
  P({ title: "Malindi Resort Borehole Pump Test", slug: "malindi-resort-pump-test", county: "Kilifi", town: "Malindi", region: "Coast", clientType: "Hospitality", serviceType: "Test Pumping", depth: 140, yield: "8 m³/hr", duration: "2 days", completionYear: 2025,
    description: "24-hour pump test for a coastal resort to check yield and salt level.",
    challenge: "Coastal boreholes can draw in salt water if pumped too hard.",
    solution: "Test with salinity readings through the 24 hours to set a safe pumping rate.",
    outcome: "Safe rate set, with a treatment option recommended for guest water.", featured: false, latitude: "-3.2140", longitude: "40.1190" }),

  // ---------------- Water purification ----------------
  P({ title: "Kiambu School UV and Filtration System", slug: "kiambu-school-purification", county: "Kiambu", town: "Kiambu", region: "Nairobi Metropolitan", clientType: "Education", serviceType: "Water Purification", depth: null, yield: "1,000 L/hr", duration: "2 days", completionYear: 2025,
    description: "Sand and carbon filtration with a UV steriliser so students drink safe water straight from the tap.",
    challenge: "Borehole water tested positive for bacteria and had a muddy taste.",
    solution: "Sand filter, carbon filter and UV unit installed, with staff shown how to service them.",
    outcome: "Clean, safe drinking water for the whole school.", featured: false, latitude: "-1.1710", longitude: "36.8350" }),
  P({ title: "Nakuru Bottled Water Plant RO System", slug: "nakuru-bottling-plant-ro", county: "Nakuru", town: "Nakuru", region: "Rift Valley", clientType: "Commercial", serviceType: "Water Purification", depth: null, yield: "500 L/hr", duration: "4 days", completionYear: 2024,
    description: "Reverse osmosis treatment line for a small bottled water business.",
    challenge: "Rift Valley borehole water is high in minerals and was too salty for bottling.",
    solution: "Pre-filtration, 500 L/hr RO unit and UV finishing installed with a storage tank.",
    outcome: "Consistent, good-tasting water ready for bottling.", featured: false, latitude: "-0.3030", longitude: "36.0800" }),
  P({ title: "Kilifi Clinic Water Treatment", slug: "kilifi-clinic-treatment", county: "Kilifi", town: "Kilifi", region: "Coast", clientType: "Healthcare", serviceType: "Water Purification", depth: null, yield: "800 L/hr", duration: "2 days", completionYear: 2025,
    description: "Water softener and UV system for a coastal clinic.",
    challenge: "Hard, slightly salty water was damaging equipment and unsafe for patients.",
    solution: "Softener, filtration and UV sterilisation installed on the clinic's main line.",
    outcome: "Softer, safe water, with less scale in sterilisers and taps.", featured: false, latitude: "-3.6300", longitude: "39.8490" }),
  P({ title: "Kitui Dispensary Salinity Reduction", slug: "kitui-dispensary-ro", county: "Kitui", town: "Kitui", region: "Eastern", clientType: "Healthcare", serviceType: "Water Purification", depth: null, yield: "500 L/hr", duration: "3 days", completionYear: 2024,
    description: "Small reverse osmosis unit that turned a salty borehole into drinking water for a dispensary.",
    challenge: "Borehole water was too salty to drink.",
    solution: "500 L/hr RO unit with pre-filters and a clean-water storage tank.",
    outcome: "The dispensary and nearby homes now collect drinkable water.", featured: false, latitude: "-1.3750", longitude: "38.0100" }),
  P({ title: "Nairobi Apartments Softener and Filtration", slug: "nairobi-apartments-softener", county: "Nairobi", town: "Embakasi", region: "Nairobi Metropolitan", clientType: "Residential", serviceType: "Water Purification", depth: null, yield: "2,000 L/hr", duration: "2 days", completionYear: 2025,
    description: "Water softener and filtration for an apartment block on borehole water.",
    challenge: "Hard water was scaling pipes, heaters and taps.",
    solution: "Softener and sand filter installed on the main tank line with an auto-regenerating valve.",
    outcome: "No more scale build-up, with softer water in every flat.", featured: false, latitude: "-1.3010", longitude: "36.9000" }),

  // ---------------- Pump installation ----------------
  P({ title: "Runda Residence Pump Installation", slug: "runda-residence-pump", county: "Nairobi", town: "Runda", region: "Nairobi Metropolitan", clientType: "Residential", serviceType: "Pump Installation", depth: 240, yield: "4 m³/hr", duration: "1 day", completionYear: 2025,
    description: "Submersible pump and pressure system for a home with an existing deep borehole.",
    challenge: "At 240m the pump needed enough power and a strong rising main.",
    solution: "Correctly sized submersible pump, new rising main, control panel and a pressure tank.",
    outcome: "Steady water at every tap, and lower electricity use than the old pump.", featured: false, latitude: "-1.2130", longitude: "36.8180" }),
  P({ title: "Kakamega Town Hotel Pump Upgrade", slug: "kakamega-hotel-pump", county: "Kakamega", town: "Kakamega", region: "Western", clientType: "Hospitality", serviceType: "Pump Installation", depth: 150, yield: "6 m³/hr", duration: "1 day", completionYear: 2024,
    description: "New submersible pump and storage tank link for a hotel whose old pump kept failing.",
    challenge: "Frequent pump failures left guests without water.",
    solution: "Right-sized pump, protection against dry running and a new tank feed line.",
    outcome: "Reliable supply with no breakdowns since.", featured: false, latitude: "0.2820", longitude: "34.7520" }),
  P({ title: "Kajiado Dairy Pump and Pressure System", slug: "kajiado-dairy-pump", county: "Kajiado", town: "Kajiado", region: "Rift Valley", clientType: "Agricultural", serviceType: "Pump Installation", depth: 210, yield: "5 m³/hr", duration: "1 day", completionYear: 2025,
    description: "Pump, control panel and pressure system for a dairy farm with a 210m borehole.",
    challenge: "Cows were watered by hand because the old pump could not push water to the troughs.",
    solution: "Higher-head submersible pump with pipework to a header tank and the troughs.",
    outcome: "Automatic water at all troughs and less labour each day.", featured: false, latitude: "-1.8530", longitude: "36.7790" }),
  P({ title: "Kisumu Estate Booster and Tank System", slug: "kisumu-estate-booster", county: "Kisumu", town: "Kisumu", region: "Nyanza", clientType: "Residential", serviceType: "Pump Installation", depth: 145, yield: "5 m³/hr", duration: "2 days", completionYear: 2025,
    description: "Pump, elevated tank and booster set for a small estate on one borehole.",
    challenge: "Houses on higher ground got little pressure.",
    solution: "New pump, elevated tank and a booster set with automatic pressure control.",
    outcome: "Even pressure for every house in the estate.", featured: false, latitude: "-0.1020", longitude: "34.7570" }),

  // ---------------- Full package: survey + drilling + pump ----------------
  P({ title: "Kitengela Estate Full Borehole Package", slug: "kitengela-estate-full-package", county: "Kajiado", town: "Kitengela", region: "Rift Valley", clientType: "Residential", serviceType: "Full Package", depth: 240, yield: "6 m³/hr", duration: "9 days", completionYear: 2025,
    description: "Survey, drilling, test pumping and pump installation for a new estate, delivered by one team.",
    challenge: "Deep, dry ground and a tight timeline before residents moved in.",
    solution: "Survey picked the site, a 240m borehole was drilled and cased, tested for 24 hours, and a submersible pump and tank installed.",
    outcome: "Estate handed over with working water, a test report and permit paperwork.", featured: true, latitude: "-1.4780", longitude: "36.9560" }),
  P({ title: "Kakamega Farm Full Package", slug: "kakamega-farm-full-package", county: "Kakamega", town: "Kakamega", region: "Western", clientType: "Agricultural", serviceType: "Full Package", depth: 150, yield: "8 m³/hr", duration: "7 days", completionYear: 2024,
    description: "Survey, drilling and a pump on one contract for a mixed farm in western Kenya.",
    challenge: "The farm needed water for livestock and vegetables without hitting a dry hole.",
    solution: "Survey, then a 150m borehole, test pumping and a pump with a storage tank and trough pipework.",
    outcome: "Year-round water for animals and a small irrigation plot.", featured: false, latitude: "0.2800", longitude: "34.7500" }),
  P({ title: "Malindi Beach Hotel Full Package", slug: "malindi-hotel-full-package", county: "Kilifi", town: "Malindi", region: "Coast", clientType: "Hospitality", serviceType: "Full Package", depth: 140, yield: "7 m³/hr", duration: "8 days", completionYear: 2025,
    description: "Survey, drilling, pump and UV treatment for a small beach hotel.",
    challenge: "Salt water near the sea, so the borehole had to be placed and cased carefully.",
    solution: "Inland survey point, a 140m cased borehole, test pumping, pump installation and UV sterilisation.",
    outcome: "Safe fresh water for guests and the kitchen.", featured: false, latitude: "-3.2160", longitude: "40.1180" }),

  // ---------------- Drilling and pump ----------------
  P({ title: "Thika Poultry Farm Borehole and Pump", slug: "thika-poultry-farm-borehole-pump", county: "Kiambu", town: "Thika", region: "Nairobi Metropolitan", clientType: "Agricultural", serviceType: "Drilling & Pump", depth: 200, yield: "4 m³/hr", duration: "6 days", completionYear: 2024,
    description: "A 200m borehole and pump system for a poultry farm.",
    challenge: "Large flocks need steady clean water every day.",
    solution: "Cased borehole drilled, then a submersible pump installed with storage tanks.",
    outcome: "Reliable water for the poultry houses and wash-down.", featured: false, latitude: "-1.0330", longitude: "37.0690" }),
  P({ title: "Kisumu Primary School Borehole and Pump", slug: "kisumu-school-borehole-pump", county: "Kisumu", town: "Kisumu", region: "Nyanza", clientType: "Education", serviceType: "Drilling & Pump", depth: 140, yield: "5 m³/hr", duration: "5 days", completionYear: 2025,
    description: "A 140m borehole and pump for a primary school and surrounding homes.",
    challenge: "Pupils were walking to a distant water point each day.",
    solution: "Borehole drilled and cased, then a pump and a raised tank installed.",
    outcome: "Taps on the school grounds and a community collection point.", featured: false, latitude: "-0.1110", longitude: "34.7450" }),

  // ---------------- Borehole drilling ----------------
  P({ title: "Kajiado Maasai Community Water Point", slug: "kajiado-community-water-point", county: "Kajiado", town: "Kajiado", region: "Rift Valley", clientType: "Community", serviceType: "Borehole Drilling", depth: 240, yield: "3 m³/hr", duration: "8 days", completionYear: 2024,
    description: "A 240m borehole serving homesteads and livestock.",
    challenge: "Very deep water and hard rock, in an area with few water points.",
    solution: "Air-hammer drilling through hard rock, then full casing and a gravel pack.",
    outcome: "Families and herds no longer walk long distances for water.", featured: false, latitude: "-1.8520", longitude: "36.7830" }),
  P({ title: "Syokimau Residential Borehole", slug: "syokimau-residential-borehole", county: "Machakos", town: "Syokimau", region: "Eastern", clientType: "Residential", serviceType: "Borehole Drilling", depth: 220, yield: "5 m³/hr", duration: "6 days", completionYear: 2025,
    description: "A 220m borehole for a family estate on the edge of Nairobi.",
    challenge: "Deep water and hard ground, with the borehole needing to be done within a week.",
    solution: "Drilled and cased to 220m, then developed and flushed until the water ran clear.",
    outcome: "A reliable private water source in place of tanker deliveries.", featured: false, latitude: "-1.3560", longitude: "36.9330" }),
];

// ---------------- 30 more hydrogeological surveys (built from a compact table) ----------------
type Climate = "dry" | "wet" | "coast" | "highland";
// [title, county, town, region, clientType, noun, climate, depth, lat, lng, year]
const SURVEY_ROWS: [string, string, string, string, string, string, Climate, number, string, string, number][] = [
  ["Kasarani Estate Survey", "Nairobi", "Kasarani", "Nairobi Metropolitan", "Residential", "housing estate", "dry", 240, "-1.2210", "36.8980", 2025],
  ["Langata Homes Borehole Survey", "Nairobi", "Langata", "Nairobi Metropolitan", "Residential", "family home", "dry", 270, "-1.3650", "36.7490", 2026],
  ["Ruaraka Commercial Plot Survey", "Nairobi", "Ruaraka", "Nairobi Metropolitan", "Commercial", "commercial plot", "dry", 220, "-1.2400", "36.8700", 2024],
  ["Juja Student Hostels Survey", "Kiambu", "Juja", "Nairobi Metropolitan", "Education", "student hostel", "dry", 210, "-1.1000", "37.0140", 2025],
  ["Limuru Farm Water Survey", "Kiambu", "Limuru", "Nairobi Metropolitan", "Agricultural", "farm", "highland", 170, "-1.1090", "36.6420", 2024],
  ["Ongata Rongai Residence Survey", "Kajiado", "Ongata Rongai", "Rift Valley", "Residential", "residence", "dry", 240, "-1.3960", "36.7440", 2025],
  ["Kitengela Commercial Block Survey", "Kajiado", "Kitengela", "Rift Valley", "Commercial", "commercial block", "dry", 230, "-1.4730", "36.9590", 2026],
  ["Isinya Greenhouse Farm Survey", "Kajiado", "Isinya", "Rift Valley", "Agricultural", "greenhouse farm", "dry", 250, "-1.8900", "36.8440", 2024],
  ["Magadi Road Community Survey", "Kajiado", "Magadi", "Rift Valley", "Community", "community water point", "dry", 260, "-1.8980", "36.2860", 2025],
  ["Mlolongo Industrial Plot Survey", "Machakos", "Mlolongo", "Eastern", "Commercial", "industrial plot", "dry", 220, "-1.3930", "36.9450", 2024],
  ["Kangundo Orchard Survey", "Machakos", "Kangundo", "Eastern", "Agricultural", "orchard", "dry", 190, "-1.3000", "37.3500", 2025],
  ["Wote Village Water Survey", "Makueni", "Wote", "Eastern", "Community", "village water point", "dry", 200, "-1.7800", "37.6290", 2024],
  ["Mwingi Dispensary Survey", "Kitui", "Mwingi", "Eastern", "Healthcare", "dispensary", "dry", 210, "-0.9330", "38.0600", 2025],
  ["Ahero Rice Farm Survey", "Kisumu", "Ahero", "Nyanza", "Agricultural", "rice farm", "wet", 150, "-0.1700", "34.9190", 2024],
  ["Kondele Residential Survey", "Kisumu", "Kondele", "Nyanza", "Residential", "residential plot", "wet", 145, "-0.0870", "34.7550", 2025],
  ["Mumias Commercial Centre Survey", "Kakamega", "Mumias", "Western", "Commercial", "commercial centre", "wet", 150, "0.3340", "34.4880", 2024],
  ["Webuye Factory Water Survey", "Bungoma", "Webuye", "Western", "Commercial", "factory", "wet", 155, "0.6070", "34.7690", 2025],
  ["Busia Town Hotel Survey", "Busia", "Busia", "Western", "Hospitality", "hotel", "wet", 150, "0.4600", "34.1120", 2024],
  ["Bondo Homestead Survey", "Siaya", "Bondo", "Nyanza", "Residential", "homestead", "wet", 145, "0.2370", "34.2740", 2025],
  ["Kisii Town School Survey", "Kisii", "Kisii", "Nyanza", "Education", "school", "highland", 150, "-0.6820", "34.7660", 2026],
  ["Njoro Dairy Farm Survey", "Nakuru", "Njoro", "Rift Valley", "Agricultural", "dairy farm", "dry", 230, "-0.3310", "35.9440", 2024],
  ["Naivasha Health Centre Survey", "Nakuru", "Naivasha", "Rift Valley", "Healthcare", "health centre", "dry", 220, "-0.7170", "36.4310", 2025],
  ["Eldoret Residential Estate Survey", "Uasin Gishu", "Eldoret", "Rift Valley", "Residential", "residential estate", "highland", 170, "0.5140", "35.2700", 2025],
  ["Kericho Tea Farm Survey", "Kericho", "Kericho", "Rift Valley", "Agricultural", "tea farm", "highland", 150, "-0.3670", "35.2830", 2024],
  ["Karatina Market Water Survey", "Nyeri", "Karatina", "Central", "Commercial", "market", "highland", 160, "-0.4830", "37.1290", 2025],
  ["Maua Miraa Farm Survey", "Meru", "Maua", "Eastern", "Agricultural", "farm", "highland", 170, "0.2300", "37.9440", 2024],
  ["Runyenjes Homestead Survey", "Embu", "Runyenjes", "Eastern", "Residential", "homestead", "highland", 150, "-0.4190", "37.5710", 2025],
  ["Mtwapa Residential Survey", "Kilifi", "Mtwapa", "Coast", "Residential", "residential plot", "coast", 120, "-3.9490", "39.7380", 2025],
  ["Ukunda Guest House Survey", "Kwale", "Ukunda", "Coast", "Hospitality", "guest house", "coast", 130, "-4.2900", "39.5700", 2026],
  ["Nyali Apartments Survey", "Mombasa", "Nyali", "Coast", "Residential", "apartment block", "coast", 110, "-4.0200", "39.7160", 2024],
];

const CHALLENGE: Record<Climate, string> = {
  dry: "Deep water and hard ground, so a wrongly placed borehole is costly.",
  wet: "Water sits at different depths from one spot to the next.",
  highland: "Hilly ground with water in fractured rock that is easy to miss.",
  coast: "Close to the sea, where a wrongly placed borehole pulls in salt water.",
};
const YIELD: Record<Climate, string[]> = {
  dry: ["Est. 3 m³/hr", "Est. 4 m³/hr", "Est. 5 m³/hr", "Est. 6 m³/hr"],
  wet: ["Est. 5 m³/hr", "Est. 6 m³/hr", "Est. 7 m³/hr", "Est. 8 m³/hr"],
  highland: ["Est. 4 m³/hr", "Est. 5 m³/hr", "Est. 6 m³/hr", "Est. 7 m³/hr"],
  coast: ["Est. 3 m³/hr", "Est. 4 m³/hr", "Est. 5 m³/hr", "Est. 3 m³/hr"],
};
const OUTCOME = [
  "Drill point, depth and report handed over before any drilling money was spent.",
  "The client drilled at the marked point and avoided a dry hole.",
  "Report supported the WARMA permit application.",
  "The client got a clear drilling depth and a written report for the drilling quote.",
];

const slugify = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

const MORE_SURVEYS: NewProject[] = SURVEY_ROWS.map(([title, county, town, region, clientType, noun, climate, depth, lat, lng, year], i) => ({
  title,
  slug: slugify(title),
  county, town, region, clientType,
  serviceType: "Hydrogeological Survey",
  depth,
  yield: YIELD[climate][i % 4],
  duration: "1 day",
  completionYear: year,
  description: `Hydrogeological survey for a ${noun} in ${town}, to find the best borehole point before drilling.`,
  challenge: CHALLENGE[climate],
  solution: `ADMT-300S-X geophysical scan of ${2 + (i % 3)} candidate sites. The strongest water-bearing zone was marked, with a recommended depth of ${depth}m.`,
  outcome: OUTCOME[i % 4],
  featured: false,
  latitude: lat,
  longitude: lng,
}));

NEW_PROJECTS.push(...MORE_SURVEYS);
