// Base housing areas: the curated grouping in src/data/base_housing_areas.json
// (manual/base_housing_areas.csv in the data repo), joined to the LMH communities
// and the latest Housing Service Center wait list.
import { getCollection } from 'astro:content';
import { monthName } from './format';

// Index sections, in order. base_group is set by hand per area in the data repo.
export const INDEX_GROUPS = [
  { key: 'MIRAMAR', title: 'MCAS Miramar' },
  { key: 'NBSD', title: 'Naval Base San Diego' },
  { key: 'NBPL', title: 'Naval Base Point Loma' },
  { key: 'CORONADO', title: 'Coronado (NAS North Island, Naval Amphibious Base)' },
  { key: 'NONE', title: 'No base named by LMH' },
  { key: 'PENDLETON', title: 'Camp Pendleton' },
] as const;

// "02-04 Months" -> [2, 4]; "No Units" -> null
export const parseWait = (s: string): [number, number] | null => {
  const m = s.match(/(\d+)\s*-\s*(\d+)\s*Month/i);
  return m ? [Number(m[1]), Number(m[2])] : null;
};

export async function baseHousingAreas() {
  const communities = new Map((await getCollection('baseHousing')).map((h) => [h.id, { id: h.id, ...h.data }]));
  const latest = (await getCollection('baseHousingWaits')).map((w) => w.data).filter((w) => w.is_latest);
  const month = latest.length ? monthName(latest[0].as_of_date) : '';
  const pdfs = [...new Map(latest.map((w) => [w.source_url, w])).values()].sort((a, b) => a.rank_group.localeCompare(b.rank_group));

  const areas = (await getCollection('baseHousingAreas'))
    .map((a) => {
      const members = a.data.community_slugs.map((s) => {
        const c = communities.get(s);
        if (!c) throw new Error(`base_housing_areas: ${a.id} lists unknown community ${s}`);
        return c;
      });
      const ids = new Set(a.data.community_slugs);
      const waits = latest.filter((w) => w.community_slugs.some((s) => ids.has(s)));
      const spans = waits.map((w) => parseWait(w.wait_time_stated)).filter((x): x is [number, number] => !!x);
      const waitRange = spans.length ? [Math.min(...spans.map((x) => x[0])), Math.max(...spans.map((x) => x[1]))] as const : null;
      return { id: a.id, ...a.data, members, waits, waitRange };
    })
    .sort((a, b) => a.order - b.order);
  return { areas, month, pdfs, verifiedOn: latest[0]?.verified_on ?? '' };
}
