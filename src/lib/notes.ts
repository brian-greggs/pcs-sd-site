// Human-written lead and gotchas. They render only when the file has real
// content (status is not "placeholder" and the text isn't the placeholder), so
// no page ever shows a placeholder. scripts/check_principles.mjs enforces this.
import { render, type CollectionEntry } from 'astro:content';

type Notes = CollectionEntry<'communityNotes'> | CollectionEntry<'baseHousingNotes'>;
const PLACEHOLDER = /PLACEHOLDER|Brian writes/i;

export async function writtenNotes(entry: Notes | undefined) {
  if (!entry || entry.data.status === 'placeholder') return null;
  const lead = PLACEHOLDER.test(entry.data.lead) ? null : entry.data.lead;
  const body = (entry.body ?? '').trim();
  const Gotchas = body && !PLACEHOLDER.test(body) ? (await render(entry)).Content : null;
  return { lead, Gotchas, verifiedOn: entry.data.verified_on };
}
