// The site menu: one list, rendered in the drawer (every page, src/layouts/Base.astro) and on /browse/ (the
// menu without JavaScript), so the two can't differ. scripts/check_frontend.mjs checks that every link resolves
// and that the drawer and /browse/ list the same links.
import { BASES } from './bases';

export type MenuLink = { href: string; text: string };
export const MENU: { id: string; label: string; links: MenuLink[] }[] = [
  { id: 'bases', label: 'By base', links: BASES.map((b) => ({ href: `/base/${b.slug}/`, text: b.short })) },
  {
    id: 'live', label: 'Where to live', links: [
      { href: '/neighborhoods/', text: 'Neighborhoods' },
      { href: '/base-housing/', text: 'Base housing' },
    ],
  },
  {
    id: 'move', label: 'The move', links: [
      { href: '/sequence/', text: 'Move sequence' },
      { href: '/sequence/forms/', text: 'Forms and claims' },
      { href: '/plan/', text: 'Starting plan' },
    ],
  },
  {
    id: 'about', label: 'About this site', links: [
      { href: '/sources/', text: 'Sources and how the numbers work' },
      { href: '/changelog/', text: 'What changed' },
    ],
  },
];
