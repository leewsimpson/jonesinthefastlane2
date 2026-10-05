/** Shelf packer for spritesheets. Sprites in one atlas have similar sizes, so shelves waste little space. */
export interface PackItem {
  id: string;
  width: number;
  height: number;
}

export interface Placement extends PackItem {
  page: number;
  x: number;
  y: number;
}

export interface PackResult {
  pages: { width: number; height: number }[];
  placements: Placement[];
}

/** Packs tallest-first onto shelves, opening a new page when one fills. Gaps of `padding` px separate sprites. */
export function pack(items: PackItem[], maxSize = 2048, padding = 2): PackResult {
  const sorted = [...items].sort(
    (a, b) => b.height - a.height || b.width - a.width || a.id.localeCompare(b.id),
  );
  const pages: { width: number; height: number }[] = [];
  const placements: Placement[] = [];
  let page = -1;
  let x = 0;
  let shelfY = 0;
  let shelfHeight = 0;

  const openPage = () => {
    page++;
    pages.push({ width: 0, height: 0 });
    x = 0;
    shelfY = 0;
    shelfHeight = 0;
  };

  for (const item of sorted) {
    if (item.width > maxSize || item.height > maxSize) {
      throw new Error(`${item.id} (${item.width}×${item.height}) is larger than ${maxSize}px`);
    }
    if (page === -1) openPage();
    if (x + item.width > maxSize) {
      shelfY += shelfHeight + padding;
      x = 0;
      shelfHeight = 0;
    }
    if (shelfY + item.height > maxSize) openPage();
    placements.push({ ...item, page, x, y: shelfY });
    const current = pages[page] as { width: number; height: number };
    current.width = Math.max(current.width, x + item.width);
    current.height = Math.max(current.height, shelfY + item.height);
    x += item.width + padding;
    shelfHeight = Math.max(shelfHeight, item.height);
  }
  return { pages, placements };
}
