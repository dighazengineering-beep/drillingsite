import { SERVICES } from "./seedCatalog";
// The four main services (survey, full drilling, test pumping, pump installation). They are put back by applyCatalogFixes if the database has none of them (for example a new empty database); never overwritten when present, never re-added when the owner deleted them.
const CORE = new Set(["borehole-drilling", "test-pumping", "pump-installation", "hydrogeological-surveys"]);
export const CORE_SERVICES = SERVICES.filter((x) => CORE.has(x.slug));
