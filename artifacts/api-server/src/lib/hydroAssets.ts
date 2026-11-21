import { LOGO_PNG_B64 } from "./logoData";
/** The company logo already used on the site's quotes and receipts. */
export const logoPng = (): Buffer => Buffer.from(LOGO_PNG_B64, "base64");
