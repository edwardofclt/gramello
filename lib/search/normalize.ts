import { freshProduceQualifiers, freshProduceTerms, phraseAliases, singularWords, spellingVocabulary } from './aliases';
import lexicon from './lexicon.generated';

const possessives: Record<string,string> = lexicon.possessives;
const knownWords = new Set([...lexicon.knownWords, ...spellingVocabulary]);
const sortedWords = [...knownWords].sort();
const suggestionsByLength = new Map<number,string[]>();
for (const word of new Set([...lexicon.suggestionWords, ...spellingVocabulary])) {
  const words = suggestionsByLength.get(word.length) ?? [];
  words.push(word); suggestionsByLength.set(word.length,words);
}
function knownPrefix(token: string) {
  let low=0, high=sortedWords.length;
  while(low<high) { const middle=(low+high)>>>1; if(sortedWords[middle]<token) low=middle+1; else high=middle; }
  return sortedWords[low]?.startsWith(token) ?? false;
}

export function normalizeSearchText(text: string): string {
  return text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/[‘’ʼ']/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}
function aliasText(text: string) {
  const possessiveText = normalizeSearchText(text).split(' ').map(token=>possessives[token] ?? token).join(' ');
  let value = phraseAliases.reduce((value, [pattern, replacement]) => value.replace(pattern, replacement), possessiveText);
  if (/\b(chicken|turkey|duck|goose|quail|pheasant|poultry)\b/.test(value)) {
    value = value.replace(/\b(?:without skin|skin removed|meat only)\b/g, 'skinless');
  }
  const terms = value.split(' ').map(token=>singularWords[token] ?? token);
  if (terms.includes('fresh') && terms.some(token=>freshProduceTerms.has(token))
    && terms.every(token=>freshProduceTerms.has(token) || freshProduceQualifiers.has(token))) {
    value = value.replace(/\bfresh\b/g,'raw');
  }
  return value;
}
export function foodSearchTerms(text: string): string[] {
  return aliasText(text).split(' ').filter(Boolean).map(token => singularWords[token] ?? token);
}
function oneEdit(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  if (a.length === b.length) {
    const changes = [...a].map((c, i) => c === b[i] ? -1 : i).filter(i => i >= 0);
    return changes.length === 1 || (changes.length === 2 && changes[1] === changes[0] + 1
      && a[changes[0]] === b[changes[1]] && a[changes[1]] === b[changes[0]]);
  }
  const [short, long] = a.length < b.length ? [a,b] : [b,a];
  let i = 0; while (i < short.length && short[i] === long[i]) i++;
  return short.slice(i) === long.slice(i + 1);
}
export function analyzeFoodQuery(query: string): { normalized: string; tokens: string[]; variants: string[]; correction?: string } {
  const normalized = normalizeSearchText(query.slice(0, 200));
  if (!normalized) return { normalized, tokens: [], variants: [] };
  const aliased = aliasText(normalized).split(' ').slice(0, 10);
  let corrected = false;
  const words = aliased.map(token => {
    if (token.length < 5 || token.length > 24 || knownWords.has(token)) return token;
    // Do not rewrite intentional prefixes or guess between several valid words.
    if (knownPrefix(token)) return token;
    const candidates = [token.length-1,token.length,token.length+1].flatMap(length=>suggestionsByLength.get(length) ?? []);
    const choices = [...new Set(candidates.filter(word => oneEdit(token, word)).map(word=>singularWords[word] ?? word))];
    if (choices.length !== 1) return token;
    corrected = true; return choices[0];
  });
  const tokens = foodSearchTerms(words.join(' '));
  const stems = tokens.map(token => token.endsWith('y') && Object.values(singularWords).includes(token) ? token.slice(0, -1) : token);
  const canonical = tokens.join(' ');
  const skinVariant = /\b(chicken|turkey|duck|goose|quail|pheasant|poultry)\b/.test(canonical) ? canonical.replace(/\bskinless\b/g,'meat only') : canonical;
  const variants = [...new Set([normalized, aliased.join(' '), words.join(' '), canonical, stems.join(' '), skinVariant])].slice(0, 6);
  return { normalized, tokens, variants, ...(corrected ? { correction: words.join(' ') } : {}) };
}
