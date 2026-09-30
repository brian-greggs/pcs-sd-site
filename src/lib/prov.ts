// Provenance rows (src/data/provenance.json) and the date line built from them.
import { getCollection } from 'astro:content';

export async function provenance() {
  const prov = Object.fromEntries((await getCollection('provenance')).map((p) => [p.id, p.data]));
  const asOf = (id: string) => `${prov[id].vintage} · verified ${prov[id].verified_on}`;
  return { prov, asOf };
}

export const titleCase = (s: string) => s.toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase());
