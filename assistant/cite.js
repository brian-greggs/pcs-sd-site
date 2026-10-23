// Citation labels and the From list (shared by assistant/ask.js and assistant/prompt.js).
// Each section has a short label: the model cites it in parentheses, the From list under the answer
// shows the same words with the link and verified date. A sequence step's heading is the step itself
// (a sentence), so its label is the step number; other headings stop before a "(" or ";".
export const sectionOf = (c) => c.section_heading.replace(/ \(part \d+ of \d+\)$/, '');
export function labelOf(c) {
  const h = sectionOf(c);
  const step = h.match(/^(\d+)\.\s/);
  return step ? `${c.page_title}, step ${step[1]}` : `${c.page_title}: ${h.replace(/\s*[(;].*$/, '').trim() || h}`;
}

// The From list shows only the sections the answer cites, matched by label, in the order the answer
// cites them. None matched: the model's "I don't have that" gets the nearest page; any other answer
// gets every section sent (cited_by tells the page and the eval which of the three it was).
const NO_ANSWER_RE = /I don[’']t have that in the San Diego material/i;
const norm = (s) => s.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/\s+/g, ' ');
const WORD = /[\p{L}\p{N}]/u;
const spans = (answer, label) => {
  const out = [];
  for (let i = answer.indexOf(label); i >= 0; i = answer.indexOf(label, i + 1)) {
    if (!WORD.test(answer[i - 1] ?? '') && !WORD.test(answer[i + label.length] ?? '')) out.push([i, i + label.length]);
  }
  return out;
};
export function citedOnly(answer, citations, nearest) {
  const a = norm(answer);
  const found = citations.map((c) => [c, spans(a, norm(c.label))]);
  // A match inside a longer label's match ("Santee: Cost" in "Santee: Cost vs BAH") isn't a citation.
  const all = found.flatMap(([, s]) => s);
  const inLonger = ([i, j]) => all.some(([x, y]) => x <= i && j <= y && y - x > j - i);
  const cited = found.map(([c, s]) => [s.find((sp) => !inLonger(sp))?.[0] ?? -1, c]).filter(([i]) => i >= 0).sort((x, y) => x[0] - y[0]).map(([, c]) => c);
  if (cited.length) return { citations: cited, cited_by: 'label' };
  if (NO_ANSWER_RE.test(answer) && nearest) return { citations: [{ url: nearest.url, title: nearest.title, label: nearest.title }], cited_by: 'nearest' };
  return { citations, cited_by: 'all' };
}
