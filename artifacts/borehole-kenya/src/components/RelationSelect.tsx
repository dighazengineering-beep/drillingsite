import { useState } from "react";

/** The usual ways a witness is related to the client, so nobody has to type them. "Other" opens a box for anything not listed. */
export const RELATIONS = ["Brother", "Sister", "Wife", "Husband", "Father", "Mother", "Son", "Daughter", "Uncle", "Aunt", "Cousin", "Neighbour", "Friend", "Employee", "Business partner", "Caretaker", "Landlord", "Tenant", "Village elder", "Chief"];

export function RelationSelect({ value, onChange, className, id, testId }: { value: string; onChange: (v: string) => void; className: string; id?: string; testId?: string }) {
  const [other, setOther] = useState(value !== "" && !RELATIONS.includes(value));
  return (
    <div className="space-y-2">
      <select
        id={id} data-testid={testId} className={className}
        value={other ? "__other" : value}
        onChange={(e) => { if (e.target.value === "__other") { setOther(true); onChange(""); } else { setOther(false); onChange(e.target.value); } }}
      >
        <option value="">Select the relationship</option>
        {RELATIONS.map((r) => <option key={r} value={r}>{r}</option>)}
        <option value="__other">Other (type it)</option>
      </select>
      {other && <input value={value} onChange={(e) => onChange(e.target.value)} maxLength={40} className={className} placeholder="Type the relationship" autoFocus />}
    </div>
  );
}

/** Witness names used before on this phone or computer, offered as suggestions while typing. */
const KEY = "dh-witness-names";
export const savedWitnesses = (): string[] => { try { const v = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 12) : []; } catch { return []; } };
export const saveWitness = (name: string) => { const n = name.trim(); if (!n) return; try { localStorage.setItem(KEY, JSON.stringify([n, ...savedWitnesses().filter((x) => x.toLowerCase() !== n.toLowerCase())].slice(0, 12))); } catch { /* storage blocked */ } };
