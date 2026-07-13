/**
 * Exact decimal arithmetic for money, on top of BigInt.
 *
 * The posting engine sidesteps this by letting Postgres multiply in `numeric`.
 * The tax calculator cannot: it multiplies a base by a rate and rounds the
 * result to the centavo before that number ever reaches the database, and the
 * rounded figure is what DGII sees on a 607 line.
 *
 * `0.1 + 0.2 !== 0.3` is the whole reason this file exists. An ITBIS of
 * 1234.56 * 0.18 in IEEE-754 gives 222.22079999999997; naive rounding of a long
 * invoice then drifts by a centavo or two, and a monthly 607 whose ITBIS column
 * does not tie to the ledger is rejected.
 *
 * Values are decimal strings. Internally they are BigInt scaled by 10^8, which
 * covers numeric(18,4) amounts and numeric(18,8) FX rates without loss.
 */

const SCALE = 8;
const SCALE_FACTOR = 10n ** BigInt(SCALE);

export type Decimal = string;

const DECIMAL_RE = /^-?\d+(\.\d+)?$/;

/** Parse a decimal string into a BigInt scaled by 10^8. Truncates beyond 8dp. */
function parse(value: Decimal): bigint {
  const s = value.trim();
  if (!DECIMAL_RE.test(s)) {
    throw new RangeError(`not a decimal: ${JSON.stringify(value)}`);
  }
  const negative = s.startsWith("-");
  const [int, frac = ""] = (negative ? s.slice(1) : s).split(".");
  const fracPadded = (frac + "0".repeat(SCALE)).slice(0, SCALE);
  const magnitude = BigInt(int) * SCALE_FACTOR + BigInt(fracPadded);
  return negative ? -magnitude : magnitude;
}

function render(scaled: bigint): Decimal {
  const negative = scaled < 0n;
  const magnitude = negative ? -scaled : scaled;
  const int = magnitude / SCALE_FACTOR;
  const frac = (magnitude % SCALE_FACTOR).toString().padStart(SCALE, "0");
  const trimmed = frac.replace(/0+$/, "");
  const body = trimmed ? `${int}.${trimmed}` : `${int}`;
  return negative && magnitude !== 0n ? `-${body}` : body;
}

export const add = (a: Decimal, b: Decimal): Decimal => render(parse(a) + parse(b));
export const sub = (a: Decimal, b: Decimal): Decimal => render(parse(a) - parse(b));
export const neg = (a: Decimal): Decimal => render(-parse(a));

export function mul(a: Decimal, b: Decimal): Decimal {
  // Two scaled values multiply to 10^16; divide once to return to 10^8.
  // Truncation here is below the 8th decimal — `roundTo` is what callers use to
  // land on the centavo.
  return render((parse(a) * parse(b)) / SCALE_FACTOR);
}

export const isZero = (a: Decimal): boolean => parse(a) === 0n;
export const isNegative = (a: Decimal): boolean => parse(a) < 0n;
export const cmp = (a: Decimal, b: Decimal): -1 | 0 | 1 => {
  const [x, y] = [parse(a), parse(b)];
  return x < y ? -1 : x > y ? 1 : 0;
};
export const sum = (values: Decimal[]): Decimal => values.reduce(add, "0");

/**
 * Round half away from zero to `places` decimals — the convention DGII and
 * Dominican invoicing use. Banker's rounding would systematically differ on
 * exact halves, and an invoice line ending in .005 is common with 18% ITBIS.
 */
export function roundTo(value: Decimal, places = 2): Decimal {
  if (places < 0 || places > SCALE) throw new RangeError(`places out of range: ${places}`);
  const scaled = parse(value);
  const step = 10n ** BigInt(SCALE - places);
  if (step === 1n) return render(scaled);

  const negative = scaled < 0n;
  const magnitude = negative ? -scaled : scaled;
  const remainder = magnitude % step;
  let rounded = magnitude - remainder;
  if (remainder * 2n >= step) rounded += step;
  return render(negative ? -rounded : rounded);
}

/** Fixed-width rendering for a numeric(18,4) column: always 4 decimals. */
export const toMoney = (value: Decimal): Decimal => {
  const r = parse(roundTo(value, 4));
  const negative = r < 0n;
  const magnitude = negative ? -r : r;
  const int = magnitude / SCALE_FACTOR;
  const frac = (magnitude % SCALE_FACTOR).toString().padStart(SCALE, "0").slice(0, 4);
  return `${negative && magnitude !== 0n ? "-" : ""}${int}.${frac}`;
};
