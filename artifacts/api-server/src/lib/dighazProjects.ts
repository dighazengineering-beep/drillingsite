import { db, projectsTable } from "@workspace/db";
import { logger } from "./logger";

/**
 * Dighaz Engineering's own projects (from the company's previous website). They are added once (by slug) and shown first.
 * completionYear 0 means the date is not published: the website then hides the year.
 */
const P = (x: { title: string; slug: string; county: string; town: string; region: string; clientType: string; serviceType: string; description: string }) => ({
  ...x, depth: null, yield: null, duration: null, completionYear: 0, challenge: null, solution: null, outcome: null, featured: true, latitude: null, longitude: null,
});

const DIGHAZ_PROJECTS = [
  P({ title: "Kenya Forest Service: Drilling and Solarisation", slug: "kenya-forest-service-drilling-solarisation", county: "Kenya", town: "Forest conservation areas", region: "Kenya",
    clientType: "Government", serviceType: "Drilling & Pump",
    description: "Implementation of solar-powered water drilling systems for forest conservation areas. The project involved geological surveys and the installation of sustainable water solutions.\n\nClient: Kenya Forest Service." }),
  P({ title: "50/9 Tower and Steel Tank Installation", slug: "kenya-forest-service-tower-steel-tank", county: "Kenya", town: "Forest conservation areas", region: "Kenya",
    clientType: "Government", serviceType: "Full Package",
    description: "Design and installation of water tower structures and storage tanks to support forest conservation efforts and provide reliable water distribution.\n\nClient: Kenya Forest Service." }),
  P({ title: "Mungatchi Water Project", slug: "mungatchi-water-project", county: "Busia", town: "Mungatchi", region: "Western Kenya",
    clientType: "Government", serviceType: "Full Package",
    description: "A water development project covering borehole drilling, pump installation and community water distribution to serve the Mungatchi region.\n\nClient: County Government of Busia (World Bank funded)." }),
  P({ title: "Emergency Water Solutions, South Sudan", slug: "emergency-water-solutions-unhcr-south-sudan", county: "South Sudan", town: "Refugee camps", region: "South Sudan",
    clientType: "Humanitarian", serviceType: "Borehole Drilling",
    description: "Rapid deployment of emergency water boreholes and purification systems to support refugee camps and displaced communities.\n\nClient: UNHCR South Sudan." }),
  P({ title: "Humanitarian Water Infrastructure, South Sudan", slug: "humanitarian-water-infrastructure-icrc-south-sudan", county: "South Sudan", town: "Conflict-affected communities", region: "South Sudan",
    clientType: "Humanitarian", serviceType: "Borehole Maintenance",
    description: "Development of sustainable water infrastructure for conflict-affected communities, including borehole rehabilitation and water treatment facilities.\n\nClient: ICRC South Sudan." }),
];

export async function seedDighazProjects() {
  try {
    await db.insert(projectsTable).values(DIGHAZ_PROJECTS as never).onConflictDoNothing({ target: projectsTable.slug });
  } catch (err) {
    logger.warn({ err }, "Dighaz project seeding failed");
  }
}
