/** The structure of the reference report (Al-Zahra Centre hydrogeological report), measured from the file itself.
 *  The writer compares every section it produces against this. Dates and project details differ; the layout, tables, columns and depth of treatment must match. */
export interface RefSec { words: number; paras: number; bullets: number; tables: { head: string[]; rows: number }[] }
export const REFERENCE: Record<string, RefSec> = {
 "1.1": {
  "words": 261,
  "paras": 4,
  "bullets": 0,
  "tables": []
 },
 "1.2": {
  "words": 128,
  "paras": 1,
  "bullets": 0,
  "tables": [
   {
    "head": [
     "No.",
     "Objective"
    ],
    "rows": 7
   }
  ]
 },
 "1.3": {
  "words": 118,
  "paras": 2,
  "bullets": 0,
  "tables": []
 },
 "2.1": {
  "words": 194,
  "paras": 2,
  "bullets": 0,
  "tables": [
   {
    "head": [
     "Parameter",
     "Detail"
    ],
    "rows": 13
   }
  ]
 },
 "2.2": {
  "words": 222,
  "paras": 3,
  "bullets": 0,
  "tables": [
   {
    "head": [
     "Drainage Parameter",
     "Characteristics"
    ],
    "rows": 6
   }
  ]
 },
 "2.3": {
  "words": 254,
  "paras": 3,
  "bullets": 0,
  "tables": [
   {
    "head": [
     "Climate Parameter",
     "Value / Description"
    ],
    "rows": 8
   }
  ]
 },
 "2.4": {
  "words": 193,
  "paras": 2,
  "bullets": 0,
  "tables": [
   {
    "head": [
     "Water Supply Parameter",
     "Current Status"
    ],
    "rows": 6
   }
  ]
 },
 "3.1": {
  "words": 290,
  "paras": 4,
  "bullets": 0,
  "tables": [
   {
    "head": [
     "Geological Unit",
     "Age",
     "Lithological Description",
     "Depth Range (approx.)"
    ],
    "rows": 5
   }
  ]
 },
 "3.2": {
  "words": 289,
  "paras": 4,
  "bullets": 0,
  "tables": [
   {
    "head": [
     "Aquifer System",
     "Hydrogeological Type",
     "Primary Characteristics",
     "Groundwater Potential"
    ],
    "rows": 3
   }
  ]
 },
 "4.1": {
  "words": 224,
  "paras": 2,
  "bullets": 0,
  "tables": [
   {
    "head": [
     "Aquifer Parameter",
     "Estimated Value",
     "Basis"
    ],
    "rows": 9
   }
  ]
 },
 "4.2.1": {
  "words": 77,
  "paras": 1,
  "bullets": 0,
  "tables": []
 },
 "4.2.2": {
  "words": 64,
  "paras": 1,
  "bullets": 0,
  "tables": []
 },
 "4.2.3": {
  "words": 65,
  "paras": 1,
  "bullets": 0,
  "tables": []
 },
 "4.2.4": {
  "words": 156,
  "paras": 1,
  "bullets": 0,
  "tables": [
   {
    "head": [
     "Hydraulic Parameter",
     "Estimated Range",
     "Unit",
     "Method of Estimation"
    ],
    "rows": 6
   }
  ]
 },
 "4.2.5": {
  "words": 71,
  "paras": 1,
  "bullets": 0,
  "tables": []
 },
 "4.2.6": {
  "words": 160,
  "paras": 1,
  "bullets": 0,
  "tables": [
   {
    "head": [
     "Parameter",
     "Potential Concern",
     "Recommended Action"
    ],
    "rows": 6
   }
  ]
 },
 "4.2.7": {
  "words": 113,
  "paras": 2,
  "bullets": 4,
  "tables": []
 },
 "5.1": {
  "words": 138,
  "paras": 2,
  "bullets": 0,
  "tables": []
 },
 "5.2": {
  "words": 78,
  "paras": 0,
  "bullets": 0,
  "tables": [
   {
    "head": [
     "Equipment Parameter",
     "Specification"
    ],
    "rows": 12
   }
  ]
 },
 "5.3": {
  "words": 130,
  "paras": 2,
  "bullets": 0,
  "tables": []
 },
 "5.4": {
  "words": 133,
  "paras": 2,
  "bullets": 0,
  "tables": [
   {
    "head": [
     "Resistivity Range (Ohm·m)",
     "Geological / Hydrogeological Interpretation",
     "Display Colour"
    ],
    "rows": 3
   }
  ]
 },
 "6.1": {
  "words": 244,
  "paras": 1,
  "bullets": 0,
  "tables": [
   {
    "head": [
     "Reconnaissance Item",
     "Field Observation"
    ],
    "rows": 11
   }
  ]
 },
 "6.2": {
  "words": 41,
  "paras": 1,
  "bullets": 0,
  "tables": []
 },
 "6.2.1": {
  "words": 88,
  "paras": 0,
  "bullets": 0,
  "tables": [
   {
    "head": [
     "Geoelectric Layer",
     "Depth Range (m bgs)",
     "Resistivity (Ohm·m)",
     "Geological / Hydrogeological Interpretation"
    ],
    "rows": 4
   }
  ]
 },
 "6.2.2": {
  "words": 157,
  "paras": 1,
  "bullets": 4,
  "tables": []
 },
 "6.2.3": {
  "words": 135,
  "paras": 2,
  "bullets": 0,
  "tables": []
 },
 "6.3": {
  "words": 161,
  "paras": 2,
  "bullets": 0,
  "tables": [
   {
    "head": [
     "Selection Criterion",
     "Evidence / Justification"
    ],
    "rows": 7
   }
  ]
 },
 "7": {
  "words": 258,
  "paras": 1,
  "bullets": 0,
  "tables": [
   {
    "head": [
     "No.",
     "Conclusion"
    ],
    "rows": 10
   }
  ]
 },
 "8": {
  "words": 30,
  "paras": 1,
  "bullets": 0,
  "tables": []
 },
 "8.1": {
  "words": 82,
  "paras": 0,
  "bullets": 0,
  "tables": [
   {
    "head": [
     "Recommendation",
     "Detail"
    ],
    "rows": 6
   }
  ]
 },
 "8.2": {
  "words": 98,
  "paras": 0,
  "bullets": 0,
  "tables": [
   {
    "head": [
     "Construction Element",
     "Recommended Specification"
    ],
    "rows": 6
   }
  ]
 },
 "8.3": {
  "words": 82,
  "paras": 0,
  "bullets": 0,
  "tables": [
   {
    "head": [
     "Testing Requirement",
     "Method / Duration"
    ],
    "rows": 6
   }
  ]
 },
 "8.4": {
  "words": 101,
  "paras": 1,
  "bullets": 0,
  "tables": [
   {
    "head": [
     "Analysis Category",
     "Parameters"
    ],
    "rows": 5
   }
  ]
 },
 "8.5": {
  "words": 85,
  "paras": 0,
  "bullets": 4,
  "tables": []
 },
 "8.6": {
  "words": 78,
  "paras": 0,
  "bullets": 4,
  "tables": []
 }
};
