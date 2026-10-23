// The move sequence (F2) as the pages use it: every step and form from src/data/sequence_*.json, in order.
// USMC rows are "not yet covered" and never render (Brian 2026-10-20); the Navy-rules note says so instead.
// The weight allowance table (JTR Table 5-37) comes from src/data/sequence_weights.json.
// A link to a step or form that doesn't exist fails the build here.
import { getCollection } from 'astro:content';
import { PHASES } from './sequence.js';
import formsExport from '../data/sequence_forms.json';

// Forms in the export's order (most-used first, as the data repo lists them); the collection doesn't keep it.
const FORM_ORDER = formsExport.map((f) => f.id);

export async function sequenceData() {
  const steps = (await getCollection('sequenceSteps'))
    .map((s) => ({ ...s.data, id: s.id }))
    .sort((a, b) => PHASES.findIndex((p) => p.key === a.phase) - PHASES.findIndex((p) => p.key === b.phase) || a.order - b.order);
  const forms = (await getCollection('sequenceForms'))
    .map((f) => ({ ...f.data, id: f.id }))
    .filter((f) => f.status !== 'not_yet_covered')
    .sort((a, b) => FORM_ORDER.indexOf(a.id) - FORM_ORDER.indexOf(b.id));
  const stepById = new Map(steps.map((s) => [s.id, s]));
  const formById = new Map(forms.map((f) => [f.id, f]));
  for (const s of steps) {
    for (const d of s.depends_on) if (!stepById.has(d)) throw new Error(`sequence step ${s.id}: depends on unknown step ${d}`);
    for (const f of s.forms) if (!formById.has(f)) throw new Error(`sequence step ${s.id}: unknown form ${f}`);
  }
  for (const f of forms) for (const s of f.sequence_step) if (!stepById.has(s)) throw new Error(`form ${f.id}: unknown step ${s}`);
  // JTR Table 5-37 in table order (the row ids number the lines).
  const weightRows = (await getCollection('sequenceWeights')).map((w) => ({ ...w.data, id: w.id })).sort((a, b) => a.id.localeCompare(b.id));
  const weights = weightRows.length ? {
    id: 'weight-allowances', title: weightRows[0].title, caption: weightRows[0].caption, paragraph: weightRows[0].paragraph,
    sources: [weightRows[0].source, ...weightRows[0].sources], superseded: [], rows: weightRows,
  } : null;
  // DTMO's primary DLA table in its own order (O-10 … E-1); the effective-date line.
  const dla = (await getCollection('sequenceDla')).map((d) => ({ ...d.data, id: d.id })).sort((a, b) => a.id.localeCompare(b.id));
  const eff = (await getCollection('sequenceEffectiveDate'))[0];
  const effective = eff ? { id: eff.id, ...eff.data, superseded: [] } : null;
  if (!effective) throw new Error('sequence_effective_date.json is empty');
  return { steps, forms, stepById, formById, weights, dla, effective };
}
export type SequenceData = Awaited<ReturnType<typeof sequenceData>>;
export type Step = SequenceData['steps'][number];
export type Form = SequenceData['forms'][number];
