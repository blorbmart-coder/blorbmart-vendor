/**
 * Search index — the shared vocabulary between the vendor app (which writes
 * keywords) and the buyer app (which queries them).
 *
 * Firestore has no full-text search, so the index lives in the document: a
 * `searchKeywords` string array holding every token AND every prefix of every
 * token. A prefix query then becomes a single `array-contains`.
 *
 * KEEP THIS IDENTICAL TO lib/data/search/search_index.dart in both Flutter
 * apps. This is the writing half. If the tokenizers drift, products silently
 * stop being findable — no error, no warning, just an empty search result.
 */

export const MIN_PREFIX = 2
export const MAX_PREFIX = 12

const STOP_WORDS = new Set([
  'and', 'the', 'for', 'with', 'from', 'our', 'your', 'a', 'an', 'of', 'in',
  'on', 'at', 'to', 'by', 'is', 'it', 'or', 'per', 'plus', 'pack', 'pcs',
])

/** Applied to BOTH the indexed text and the query. */
const SYNONYMS: Record<string, string> = {
  jelof: 'jollof',
  jelloff: 'jollof',
  jallof: 'jollof',
  jolof: 'jollof',
  jollofrice: 'jollof',
  shawama: 'shawarma',
  shawrma: 'shawarma',
  suya: 'suya',
  swallow: 'swallow',
  eba: 'garri',
  gari: 'garri',
  amala: 'amala',
  poundo: 'pounded',
  pounded: 'pounded',
  egusi: 'egusi',
  eguisi: 'egusi',
  efo: 'efo',
  chikwangue: 'fufu',
  fufu: 'fufu',
  foofoo: 'fufu',
  ewa: 'beans',
  ewagoyin: 'beans',
  moimoi: 'moinmoin',
  moin: 'moinmoin',
  moinmoin: 'moinmoin',
  akara: 'akara',
  chiken: 'chicken',
  chikin: 'chicken',
  chikn: 'chicken',
  peppersoup: 'pepper',
  asun: 'asun',
  nkwobi: 'nkwobi',
  isiewu: 'isiewu',
  burga: 'burger',
  burguer: 'burger',
  pizaa: 'pizza',
  piza: 'pizza',
  smallchops: 'chops',
  paracetamol: 'paracetamol',
  panadol: 'paracetamol',
  painkiller: 'analgesic',
  drugs: 'medicine',
  drug: 'medicine',
  meds: 'medicine',
  antimalaria: 'malaria',
  antimalarial: 'malaria',
  cake: 'cake',
  birthdaycake: 'cake',
  catering: 'caterer',
  mc: 'compere',
  dj: 'dj',
}

const canonical = (word: string) =>
  Object.prototype.hasOwnProperty.call(SYNONYMS, word) ? SYNONYMS[word] : word

/** Splits arbitrary text into normalised, de-duplicated search tokens. */
export function tokenize(input: string | null | undefined): string[] {
  if (input == null) return []
  const cleaned = input.toLowerCase().replace(/[^a-z0-9\s]+/g, ' ')
  const out = new Set<string>()

  for (const raw of cleaned.split(/\s+/)) {
    const word = raw.trim()
    if (word.length < 2) continue
    if (STOP_WORDS.has(word)) continue
    out.add(canonical(word))

    // Split a number-word compound so "50cl" is also findable as "cl".
    const match = /^(\d+)([a-z]+)$/.exec(word)
    if (match && match[2].length >= 2) out.add(canonical(match[2]))
  }
  return [...out]
}

/** Every prefix of the token from MIN_PREFIX to MAX_PREFIX characters. */
export function prefixesOf(token: string): string[] {
  const end = Math.min(token.length, MAX_PREFIX)
  const out: string[] = []
  for (let i = MIN_PREFIX; i <= end; i++) out.push(token.slice(0, i))
  return out
}

/**
 * Builds the `searchKeywords` array for a catalogue document. Weighted fields
 * get every prefix (people type these); context fields contribute whole
 * tokens only.
 */
export function buildSearchKeywords(weighted: string[], context: string[] = []): string[] {
  const keys = new Set<string>()

  for (const field of weighted) {
    const tokens = tokenize(field)
    for (const token of tokens) for (const p of prefixesOf(token)) keys.add(p)
    // The whole phrase, spaces removed, so "chickenandchips" matches too.
    if (tokens.length > 1) {
      const joined = tokens.join('')
      if (joined.length >= MIN_PREFIX) for (const p of prefixesOf(joined)) keys.add(p)
    }
  }

  for (const field of context) for (const t of tokenize(field)) keys.add(t)

  keys.delete('')
  return [...keys]
}
