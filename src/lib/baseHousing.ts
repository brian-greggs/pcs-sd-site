// Base-housing groups, shared by /base-housing/ and the community pages.
// A group is the LMH communities that sit beside one base (near_base, set by the
// export: among the bases a community's LMH page names, the one with the shortest
// 0700 drive from its zip). Communities with no known location form their own group.
import { getCollection } from 'astro:content';

export const BASE_ORDER = ['NBSD', 'NASNI', 'NAB', 'NBPL', 'NMCSD', 'MCRD', 'MIRAMAR', 'PENDLETON'] as const;

export async function baseHousingGroups() {
  const bases = Object.fromEntries((await getCollection('bases')).map((b) => [b.id, b.data]));
  const housing = (await getCollection('baseHousing')).map((h) => ({ id: h.id, ...h.data }));
  const groups = BASE_ORDER.map((code) => ({
    code: code as string | null,
    anchor: `near-${code.toLowerCase()}`,
    title: `Near ${bases[code].installation}`,
    installation: bases[code].installation as string,
    communities: housing.filter((h) => h.near_base === code).sort((a, b) => a.community.localeCompare(b.community)),
  })).filter((g) => g.communities.length > 0);
  const unplaced = housing.filter((h) => h.near_base == null);
  if (unplaced.length) {
    groups.push({ code: null, anchor: 'location-pending', title: 'Location not yet placed', installation: '', communities: unplaced });
  }
  return groups;
}
