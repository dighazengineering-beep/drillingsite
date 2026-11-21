// Company details for quotes. Only what is set in the environment (or already public on the site) is shown; an unset value is left out, never invented.
export interface CompanyInfo { name: string; legalName: string; phone: string; whatsapp: string; email: string; website: string; signatoryName: string; signatoryTitle: string; regNo: string; address: string }
const digits = (v: string) => v.replace(/\D/g, "");
/** +254719117660 -> +254 719 117 660 (anything else is left as typed) */
const prettyPhone = (v: string) => { const d = digits(v); return /^254\d{9}$/.test(d) ? `+254 ${d.slice(3, 6)} ${d.slice(6, 9)} ${d.slice(9)}` : v; };
export function companyInfo(): CompanyInfo {
  const phone = (process.env.COMPANY_CONTACT || "+254 719 117 660").trim();
  const wa = digits(process.env.COMPANY_WHATSAPP || "") || digits(phone);
  const email = (process.env.COMPANY_EMAIL || "dighazengineering@gmail.com").trim();
  const site = (process.env.COMPANY_WEBSITE || "https://www.dighazengineering.site").trim();
  return {
    name: (process.env.COMPANY_NAME || "Dighaz Engineering Limited").trim(),
    // the registered company name, used on contracts (the short name the public knows)
    legalName: (process.env.COMPANY_LEGAL_NAME || "Dighaz Engineering Limited").trim(),
    // who signs contracts for the company (printed on every contract; the stamp is the signature)
    signatoryName: (process.env.COMPANY_SIGNATORY_NAME || "Authorised signatory").trim(),
    signatoryTitle: (process.env.COMPANY_SIGNATORY_TITLE || "Site Manager").trim(),
    phone: prettyPhone(phone),
    // printed on contracts (set COMPANY_REG_NO / COMPANY_ADDRESS to change them)
    regNo: (process.env.COMPANY_REG_NO || "").trim(),
    address: (process.env.COMPANY_ADDRESS || "Rhapta Road, Nairobi (P.O. Box 147461, Westlands, 00800)").trim(),
    whatsapp: wa,
    email: /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(email) ? email : "",
    website: /^https?:\/\/[^\s"'<>]+$/.test(site) ? site : site && /^[\w.-]+\.[a-z]{2,}(\/\S*)?$/i.test(site) ? `https://${site}` : "",
  };
}
export const DEFAULT_NEXT_STEP = "To proceed, contact us for a detailed contract. This quotation is an estimate; the final scope, terms and payment schedule are agreed in the signed contract.";
