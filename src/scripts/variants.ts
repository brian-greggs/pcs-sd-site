// Which per-base and per-band variants a page shows. Every variant is rendered into the page (so the
// checks read every word and the page works with JavaScript off); this only flips `hidden`.
//   data-band-show="<band>"     shown for that pay band (the [data-band-select] picker, kept in localStorage)
//   data-mha-bases="<slug> …"   shown when the reader's base is one of these: BAH and the rent-to-BAH ratio
//                               follow the duty station's housing area (MHA)
//   data-base="<slug>"          shown for that base (the commute tile and summary)
//   data-band-row="<band>"      a table row highlighted for the band
// An element with several of these shows only when all of them match. The base is ?base=<slug> (from a
// base page) when the page knows it, otherwise the page's [data-default-base]. Nothing leaves the device.
const BAND_KEY = 'pcs-sd:pay-band';

export function initVariants() {
  const all = <T extends string>(attr: T) => [...document.querySelectorAll<HTMLElement>(`[${attr}]`)];
  const param = new URLSearchParams(location.search).get('base');
  const fallback = document.querySelector<HTMLElement>('[data-default-base]')?.dataset.defaultBase ?? null;
  const mhaEls = all('data-mha-bases');
  const baseEls = all('data-base');
  const inMha = (el: HTMLElement, b: string | null) => !!b && el.dataset.mhaBases!.split(' ').includes(b);
  // A base only counts for a kind of variant if the page has one for it; otherwise those keep their default.
  const mhaBase = [param, fallback].find((b) => mhaEls.some((el) => inMha(el, b))) ?? null;
  const tileBase = [param, fallback].find((b) => b && baseEls.some((el) => el.dataset.base === b)) ?? null;

  const select = document.querySelector<HTMLSelectElement>('[data-band-select]');
  let band = select?.value ?? null;
  if (select) {
    let saved: string | null = null;
    try { saved = localStorage.getItem(BAND_KEY); } catch { /* storage blocked */ }
    if (saved && [...select.options].some((o) => o.value === saved)) { select.value = saved; band = saved; }
  }

  const apply = () => {
    for (const el of all('data-band-show')) if (band) el.hidden = el.dataset.bandShow !== band || (el.dataset.mhaBases !== undefined && mhaBase !== null && !inMha(el, mhaBase));
    for (const el of mhaEls) if (mhaBase) el.hidden = !inMha(el, mhaBase) || (el.dataset.bandShow !== undefined && !!band && el.dataset.bandShow !== band);
    for (const el of baseEls) if (tileBase) el.hidden = el.dataset.base !== tileBase;
    for (const el of all('data-band-row')) el.classList.toggle('picked', el.dataset.bandRow === band);
  };
  apply();

  if (select) {
    select.addEventListener('change', () => {
      band = select.value;
      apply();
      try { localStorage.setItem(BAND_KEY, band); } catch { /* storage blocked */ }
    });
    document.querySelector<HTMLElement>('[data-band-picker]')!.hidden = false;
  }
  return { base: param && (mhaBase === param || tileBase === param) ? param : null };
}
