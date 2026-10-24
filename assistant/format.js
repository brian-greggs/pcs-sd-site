// The part of Markdown an answer may use, as plain data for the home page's conversation to render (src/pages/index.astro):
// paragraphs, "- " and "1. " lists, **bold**, and [text](/site/path) links. Everything else is text:
// a heading's #s, *italics* and `code` marks are dropped, and a link off the site keeps only its
// words. The page builds the DOM from this with createElement and textContent, never innerHTML.
const SITE_PATH = /^\/(?!\/)[\w\-./#%]*$/;
const ITEM = /^(?:[-*•]|(\d+)[.)])\s+(.*)$/;

const plain = (s) => s
  .replace(/(^|[\s(])[*_]([^*_\n]+)[*_](?=[\s).,;:!?]|$)/g, '$1$2')
  .replace(/`([^`]+)`/g, '$1');

export function inline(s) {
  const out = [];
  const re = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  for (let m; (m = re.exec(s));) {
    if (m.index > last) out.push({ type: 'text', text: plain(s.slice(last, m.index)) });
    if (m[1] != null) out.push({ type: 'strong', text: plain(m[1]) });
    else if (SITE_PATH.test(m[3])) out.push({ type: 'link', text: plain(m[2]), href: m[3] });
    else out.push({ type: 'text', text: plain(m[2]) });
    last = re.lastIndex;
  }
  if (last < s.length) out.push({ type: 'text', text: plain(s.slice(last)) });
  return out.filter((t) => t.text);
}

// [{type: 'p', inline}, {type: 'ul' | 'ol', items: [inline, …]}]
export function parseAnswer(text) {
  const blocks = [];
  let para = [];
  let list = null;
  const endPara = () => { if (para.length) blocks.push({ type: 'p', inline: inline(para.join(' ')) }); para = []; };
  const endList = () => { if (list) blocks.push(list); list = null; };
  for (const raw of String(text ?? '').split('\n')) {
    const line = raw.trim();
    if (!line) { endPara(); endList(); continue; }
    const item = line.match(ITEM);
    if (item) {
      endPara();
      const type = item[1] ? 'ol' : 'ul';
      if (list?.type !== type) { endList(); list = { type, items: [] }; }
      list.items.push(inline(item[2]));
      continue;
    }
    endList();
    para.push(line.replace(/^#{1,6}\s+/, ''));
  }
  endPara();
  endList();
  return blocks;
}
