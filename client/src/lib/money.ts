// Amounts are integer cents everywhere in the app and only become "12.50"
// at the edges: formatting for display, parsing for input.

// The currency is cosmetic (the app never moves real money), so it's one constant.
const formatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR' })

export function formatCents(cents: number): string {
  return formatter.format(cents / 100)
}

// Turns user input like "12.5" into 1250, or null if it isn't a valid amount.
// We parse the text with a regex and integer math instead of
// Math.round(parseFloat(x) * 100), because float multiplication can produce
// off-by-one-cent results (1.005 * 100 = 100.49999...).
// The whole part is capped at 6 digits to stay under the server's 1,000,000 limit.
export function parseMoneyToCents(input: string): number | null {
  const value = input.trim()
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(value)) return null
  const [whole = '0', fraction = ''] = value.split('.')
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
}