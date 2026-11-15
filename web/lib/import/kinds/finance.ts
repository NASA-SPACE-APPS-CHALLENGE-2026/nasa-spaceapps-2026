import { ACTUAL_CATS, type ActualCat } from '../../domain/finance/assumptions';
import { cropKeyOf, emptyCosts, seasonBudget, type CostCat, type SeasonPlan } from '../../domain/finance/budget';
import { fieldSetup } from '../../domain/finance/farm';
import { buildParams } from '../../domain/finance/inputs';
import { knownHistory } from '../../domain/finance/plans';
import { cropName } from '../../domain/rotation/agronomy';
import { type ImportContext, plural, r2, yearsText } from '../context';
import { cropFromText, norm, text, toDate, toNumber, type ColumnMapping } from '../mapping';
import type { Finding, Table, Txn, TxnCategory } from '../types';

/**
 * Bookkeeping exports: QuickBooks (Transaction List / Detail, Schedule F accounts), Stripe payments, and bank
 * or ledger CSVs. Each line gets a category from its account first, then its description; the farmer can
 * change it in review. Personal details (emails, card numbers) are stripped before anything is stored.
 */

const ACCOUNT_RULES: Array<[RegExp, TxnCategory]> = [
  [/transfer|owner.?s? (draw|equity|contribution)|loan (proceeds|principal)|principal|opening balance|undeposited/, 'transfer'],
  [/sales of (products|livestock|grain)|grain sales?|crop sales?|commodity sales?|sales of crops/, 'grain-sale'],
  [/agricultural program|program payments?|government payments?|\beqip\b|\bcsp\b|\barc\b|\bplc\b|\bfsa\b|\bnrcs\b|crop insurance proceeds|indemnit/, 'program'],
  [/seeds? (and|&) plants|\bseeds?\b/, 'seed'],
  [/fertili[sz]ers?|\blime\b/, 'fertilizer'],
  [/chemicals?|herbicide|insecticide|fungicide|crop protection/, 'chemicals'],
  [/insurance/, 'insurance'],
  [/rent or lease.*land|land rent|cash rent|\bland\b|farm rent/, 'land'],
  [/repairs?|maintenance|gasoline|fuel|\boil\b|diesel|custom hire|machine work|machinery|equipment|freight|trucking|drying|storage|propane|\blp\b|depreciation/, 'machinery'],
  [/labor|wages?|payroll|salar/, 'labor'],
  [/interest/, 'interest'],
  [/irrigation|pumping/, 'irrigation'],
  [/cover crop/, 'cover'],
  [/income|revenue|sales/, 'other-income'],
];

const DESCRIPTION_RULES: Array<[RegExp, TxnCategory]> = [
  [/transfer|xfer|loan payment|principal/, 'transfer'],
  [/(corn|soy\w*|beans|wheat|oats|grain|elevator|cargill|\badm\b|bunge|\bchs\b|settlement|scale ticket|commodity)/, 'grain-sale'],
  [/\bfsa\b|\bnrcs\b|\beqip\b|\busda\b|\barc\b|\bplc\b|indemnity/, 'program'],
  [/pioneer|dekalb|asgrow|channel seed|beck'?s|stine|golden harvest|\bnk\b seed|\bseed\b/, 'seed'],
  [/anhydrous|\bnh3\b|urea|potash|\buan\b|\bdap\b|\bmap\b|fertili|lime/, 'fertilizer'],
  [/chem|herbicide|spray|roundup|glyphosate|atrazine|liberty/, 'chemicals'],
  [/insurance|premium|\brma\b/, 'insurance'],
  [/\brent\b|lease/, 'land'],
  [/diesel|fuel|gas station|casey|kum ?& ?go|parts|repair|tire|john deere|case ih|implement|propane|\blp\b|custom|trucking|drying/, 'machinery'],
  [/payroll|wages|labor/, 'labor'],
  [/interest/, 'interest'],
];

const OUT_CATS = new Set<TxnCategory>(['seed', 'fertilizer', 'chemicals', 'insurance', 'machinery', 'labor', 'interest', 'land', 'cover', 'irrigation', 'other']);
const IN_CATS = new Set<TxnCategory>(['grain-sale', 'program', 'other-income']);

export function categorize(account: string, description: string, sign: number): TxnCategory {
  const a = norm(account);
  for (const [re, c] of ACCOUNT_RULES) if (a && re.test(a)) return c;
  const d = norm(description);
  for (const [re, c] of DESCRIPTION_RULES) {
    if (!re.test(d)) continue;
    // A purchase that names a crop ("soybean seed") is a cost, not a sale.
    if (c === 'grain-sale' && sign < 0) continue;
    return c;
  }
  return sign >= 0 ? 'other-income' : 'other';
}

/** Remove emails, long digit runs (card and account numbers) and phone numbers. */
export function scrub(s: string): string {
  return s
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]')
    .replace(/\b(?:\d[ -]?){9,}\b/g, '[number]')
    .replace(/\(?\d{3}\)?[ .-]\d{3}[ .-]\d{4}/g, '[phone]')
    .slice(0, 140);
}

const OUT_TYPES = /^(bill|expense|check|bill payment|credit card|purchase|debit|withdrawal)/;
const IN_TYPES = /^(invoice|sales receipt|deposit|payment|refund received|credit memo|charge)/;

/** Detect Stripe's payments export (every row is money received, less fees and refunds). */
function isStripe(headers: string[]): boolean {
  const h = headers.map(norm);
  return h.includes('amount refunded') || (h.some((x) => x.startsWith('created')) && h.includes('fee') && h.some((x) => x === 'status'));
}

export function txnsFromTable(t: Table, m: ColumnMapping): { rows: Txn[]; warnings: string[] } {
  const rows: Txn[] = [];
  const warnings: string[] = [];
  const col = (r: (string | number | null)[], role: string) => (m[role] === null || m[role] === undefined ? null : r[m[role]!]);
  const stripe = isStripe(t.headers);
  const idx = (name: string) => t.headers.findIndex((h) => norm(h) === name);
  const typeCol = t.headers.findIndex((h) => /^(transaction )?type$/.test(norm(h)));
  const statusCol = stripe ? idx('status') : -1;
  const feeCol = stripe ? idx('fee') : -1;
  const refundCol = stripe ? idx('amount refunded') : -1;
  let skipped = 0;
  let notPaid = 0;
  for (const r of t.rows) {
    const date = toDate(col(r, 'date'));
    if (!date) {
      skipped++;
      continue;
    }
    if (statusCol >= 0 && !/paid|succeeded|available/i.test(String(r[statusCol] ?? ''))) {
      notPaid++;
      continue;
    }
    let amount = toNumber(col(r, 'amount'));
    if (amount === undefined) {
      const debit = toNumber(col(r, 'debit')) ?? 0;
      const credit = toNumber(col(r, 'credit')) ?? 0;
      if (!debit && !credit) {
        skipped++;
        continue;
      }
      amount = credit - debit;
    }
    const account = text(col(r, 'account'));
    const product = text(col(r, 'product'));
    // "Payer · memo · product": the payer comes first so the main grain buyer can be read back from it.
    const description = scrub([text(col(r, 'name')), text(col(r, 'memo')), product].filter(Boolean).join(' · '));
    const type = typeCol >= 0 ? norm(String(r[typeCol] ?? '')) : '';
    let category: TxnCategory;
    if (stripe) {
      category = cropFromText(description) ? 'grain-sale' : 'other-income';
      amount = Math.abs(amount) - Math.abs(refundCol >= 0 ? (toNumber(r[refundCol]) ?? 0) : 0);
      const fee = feeCol >= 0 ? toNumber(r[feeCol]) : undefined;
      if (fee) rows.push({ date, description: 'Stripe processing fee', amount: -Math.abs(fee), category: 'other' });
    } else {
      const signHint = OUT_TYPES.test(type) ? -1 : IN_TYPES.test(type) ? 1 : Math.sign(amount) || 1;
      category = categorize(account, `${description} ${type}`, signHint);
      // Books export expenses as positive numbers; the category decides the direction.
      if (OUT_CATS.has(category)) amount = -Math.abs(amount);
      // Income is positive unless the row is explicitly money going back out (a refund or reversal).
      else if (IN_CATS.has(category)) amount = signHint < 0 ? -Math.abs(amount) : Math.abs(amount);
    }
    const crop = category === 'grain-sale' ? cropFromText(`${product} ${description} ${account}`) ?? undefined : undefined;
    let bushels = category === 'grain-sale' ? toNumber(col(r, 'qty')) : undefined;
    if (category === 'grain-sale' && bushels === undefined) {
      const m2 = description.match(/([\d,]+(?:\.\d+)?)\s*(?:bu\b|bushels?)/i);
      if (m2) bushels = toNumber(m2[1]);
    }
    rows.push({ date, description, account: account ? scrub(account) : undefined, amount: r2(amount), category, crop, bushels: bushels && bushels > 0 ? bushels : undefined });
  }
  if (skipped) warnings.push(`${plural(skipped, 'row')} had no date or amount and ${skipped === 1 ? 'was' : 'were'} skipped.`);
  if (notPaid) warnings.push(`${plural(notPaid, 'payment')} that did not go through (failed, refunded or pending) ${notPaid === 1 ? 'was' : 'were'} left out.`);
  return { rows, warnings };
}

export function financeSummary(rows: Txn[]): string {
  const income = rows.filter((r) => r.amount > 0 && r.category !== 'transfer').reduce((s, r) => s + r.amount, 0);
  const out = rows.filter((r) => r.amount < 0 && r.category !== 'transfer').reduce((s, r) => s - r.amount, 0);
  return `${plural(rows.length, 'transaction')}, ${yearsText(rows.map((r) => Number(r.date.slice(0, 4))))}: $${Math.round(income).toLocaleString('en-US')} in, $${Math.round(out).toLocaleString('en-US')} out`;
}

/** The latest year with records in both halves of the year (a reasonably complete year). */
export function bookYear(rows: Txn[]): { year: number; complete: boolean } | null {
  const halves = new Map<number, Set<number>>();
  for (const r of rows) {
    const y = Number(r.date.slice(0, 4));
    const h = Number(r.date.slice(5, 7)) <= 6 ? 0 : 1;
    if (!halves.has(y)) halves.set(y, new Set());
    halves.get(y)!.add(h);
  }
  const years = [...halves.keys()].sort((a, b) => b - a);
  if (!years.length) return null;
  const complete = years.find((y) => halves.get(y)!.size === 2);
  return complete ? { year: complete, complete: true } : { year: years[0], complete: false };
}

/** Whole-farm modeled spend per category for a past year, from the crop history and the budget defaults. */
export function modeledSpend(ctx: ImportContext, year: number): { costs: Record<CostCat, number>; acres: number; fields: number } {
  const P = buildParams(ctx.finance);
  const costs = emptyCosts();
  let acres = 0;
  let n = 0;
  for (const f of ctx.fields) {
    const hist = knownHistory(f);
    const season = hist.find((h) => h.year === year);
    if (!season) continue;
    const prevH = hist.find((h) => h.year === year - 1);
    const s: SeasonPlan = { year, crops: season.ids };
    const prev: SeasonPlan | undefined = prevH ? { year: year - 1, crops: prevH.ids } : undefined;
    const setup = fieldSetup(f, ctx.finance);
    const b = seasonBudget(s, prev, setup, P);
    for (const [cat, v] of Object.entries(b.costs) as Array<[CostCat, number]>) costs[cat] += v * setup.acres;
    acres += setup.acres;
    n++;
  }
  return { costs, acres, fields: n };
}

const CAT_LABEL: Record<ActualCat, string> = { seed: 'Seed', fertilizer: 'Fertilizer and lime', chemicals: 'Herbicide and insecticide', insurance: 'Crop insurance', machinery: 'Machinery, fuel and repairs', labor: 'Labor', other: 'Miscellaneous' };

export function financeFindings(rows: Txn[], ctx: ImportContext): { findings: Finding[]; warnings: string[] } {
  const findings: Finding[] = [];
  const warnings: string[] = [];
  const by = bookYear(rows);
  if (!by) return { findings, warnings };
  const { year, complete } = by;
  const inYear = rows.filter((r) => r.date.startsWith(String(year)) && r.category !== 'transfer');
  if (!complete) warnings.push(`The records for ${year} cover only part of the year, so the totals are partial.`);
  const yearNote = `${year}${complete ? '' : ' (part of the year)'}`;

  const revenue = inYear.filter((r) => IN_CATS.has(r.category)).reduce((s, r) => s + r.amount, 0);
  const costs = -inYear.filter((r) => OUT_CATS.has(r.category)).reduce((s, r) => s + r.amount, 0);
  // A partial year (a payments app, one quarter of a bank statement) would replace a full year's totals, so it is not ticked.
  const partialNote = complete ? '' : ' Not ticked: it would replace totals from fuller records.';
  if (revenue > 0) findings.push({ target: 'lastYear:totalRevenue', label: 'Last year’s total revenue', group: 'Totals', value: Math.round(revenue), unit: '$', evidence: `${yearNote}: grain sales, program payments and other income.${partialNote}`, confidence: complete ? 'high' : 'low', suggested: complete });
  if (costs > 0) findings.push({ target: 'lastYear:totalCosts', label: 'Last year’s total costs', group: 'Totals', value: Math.round(costs), unit: '$', evidence: `${yearNote}: farm expenses, not counting transfers and loan principal.${partialNote}`, confidence: complete ? 'high' : 'low', suggested: complete });

  // Prices received, from grain sales that say how many bushels.
  const sales = new Map<string, { dollars: number; bu: number; n: number }>();
  for (const r of rows.filter((x) => x.category === 'grain-sale' && x.crop && x.bushels && x.amount > 0)) {
    const key = cropKeyOf(r.crop!);
    if (!key) continue;
    const y = Number(r.date.slice(0, 4));
    const k = `${key}:${y}`;
    const s = sales.get(k) ?? { dollars: 0, bu: 0, n: 0 };
    s.dollars += r.amount;
    s.bu += r.bushels!;
    s.n++;
    sales.set(k, s);
  }
  const latestByCrop = new Map<string, number>();
  for (const k of sales.keys()) {
    const [key, y] = k.split(':');
    latestByCrop.set(key, Math.max(latestByCrop.get(key) ?? 0, Number(y)));
  }
  for (const [key, y] of latestByCrop) {
    const s = sales.get(`${key}:${y}`)!;
    const price = s.dollars / s.bu;
    findings.push({
      target: `param:${key}.price`,
      label: `${cropName(key === 'wheat' ? 'winter-wheat' : key)} price received`,
      group: 'Prices',
      value: r2(price),
      unit: '$/bu',
      evidence: `${y}: ${plural(s.n, 'sale')}, ${Math.round(s.bu).toLocaleString('en-US')} bu for $${Math.round(s.dollars).toLocaleString('en-US')}`,
      confidence: s.bu >= 1000 || s.n >= 2 ? 'high' : 'medium',
      suggested: price > 0.5 && price < 40,
    });
  }

  // Cash rent per acre.
  const rent = -inYear.filter((r) => r.category === 'land').reduce((s, r) => s + r.amount, 0);
  const rentedAcres = ctx.fields.reduce((s, f) => s + ((ctx.finance.fields[f.id]?.tenure ?? 'cash') === 'cash' ? fieldSetup(f, ctx.finance).acres : 0), 0);
  if (rent > 0 && rentedAcres > 0) {
    const perAc = rent / rentedAcres;
    findings.push({ target: 'param:rent', label: 'Cash rent', group: 'Input costs', value: Math.round(perAc), unit: '$/ac', evidence: `${yearNote}: $${Math.round(rent).toLocaleString('en-US')} rent over ${Math.round(rentedAcres)} cash-rented acres`, confidence: perAc > 50 && perAc < 800 ? 'medium' : 'low', suggested: perAc > 50 && perAc < 800 });
  }

  // Grain buyer: who most sales came from.
  const buyers = new Map<string, number>();
  // Only bookkeeping rows name the payer; payment-app rows describe the product instead.
  for (const r of inYear.filter((x) => x.category === 'grain-sale' && x.account)) {
    const name = r.description.split(' · ')[0].trim();
    if (name && !/\[(email|number|phone)\]/.test(name)) buyers.set(name, (buyers.get(name) ?? 0) + r.amount);
  }
  const topBuyer = [...buyers].sort((a, b) => b[1] - a[1])[0];
  if (topBuyer) findings.push({ target: 'supplier:grainBuyer', label: 'Main grain buyer', group: 'Suppliers', value: topBuyer[0].slice(0, 60), evidence: `Largest grain payer in ${year}`, confidence: 'medium', suggested: true });

  // Actual cost calibration: what was spent vs what PlotTwist modeled for the same fields and crops (opt-in).
  const model = modeledSpend(ctx, year);
  if (model.fields > 0) {
    for (const cat of ACTUAL_CATS) {
      const actual = -inYear.filter((r) => r.category === cat).reduce((s, r) => s + r.amount, 0);
      const modeled = model.costs[cat];
      if (actual <= 0 || modeled <= 0) continue;
      const factor = actual / modeled;
      const plausible = factor >= 0.4 && factor <= 2.5;
      findings.push({
        target: `param:actual.${cat}`,
        label: `${CAT_LABEL[cat]}: scale the budget to what you spent`,
        group: 'Your actual costs',
        value: Math.round(factor * 100) / 100,
        unit: '×',
        evidence: `${yearNote}: you spent $${Math.round(actual).toLocaleString('en-US')}; PlotTwist modeled $${Math.round(modeled).toLocaleString('en-US')} for ${plural(model.fields, 'field')} (${Math.round(model.acres)} ac).${cat === 'machinery' ? ' Books usually leave out machinery ownership costs, so this can look low.' : cat === 'labor' ? ' Your own and family labor is usually unpaid and not in the books, so this can look low.' : ''}${complete ? '' : ' Partial year.'}`,
        confidence: plausible && complete ? 'medium' : 'low',
        suggested: false,
      });
    }
  } else if (rows.length) {
    warnings.push(`None of your fields has a crop entered for ${year}, so your actual costs can't be compared with the budget. Enter past crops on Fields to enable it.`);
  }
  return { findings, warnings };
}
