/** All money is integer paise. */
export const toPaise = (rupees: number) => Math.round((rupees + Number.EPSILON) * 100);
export const toRupees = (paise: number) => paise / 100;
export const fmtINR = (paise: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 }).format(paise / 100);
