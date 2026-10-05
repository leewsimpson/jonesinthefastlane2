/** Trim boxes and emotion-sheet slicing on keyed RGBA pixels. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Alpha above this counts as art. Lower values are leftover fringe. */
const ALPHA_MIN = 16;
/** A row or column needs this many art pixels to count, so stray specks don't widen the trim. */
const MIN_PIXELS = 2;

function columnCoverage(px: Uint8Array, imageWidth: number, region: Rect): Uint32Array {
  const counts = new Uint32Array(region.width);
  for (let y = region.y; y < region.y + region.height; y++) {
    for (let x = region.x; x < region.x + region.width; x++) {
      if ((px[(y * imageWidth + x) * 4 + 3] as number) > ALPHA_MIN) {
        counts[x - region.x] = (counts[x - region.x] as number) + 1;
      }
    }
  }
  return counts;
}

function rowCoverage(px: Uint8Array, imageWidth: number, region: Rect): Uint32Array {
  const counts = new Uint32Array(region.height);
  for (let y = region.y; y < region.y + region.height; y++) {
    for (let x = region.x; x < region.x + region.width; x++) {
      if ((px[(y * imageWidth + x) * 4 + 3] as number) > ALPHA_MIN) {
        counts[y - region.y] = (counts[y - region.y] as number) + 1;
      }
    }
  }
  return counts;
}

function span(counts: Uint32Array): [number, number] | null {
  const first = counts.findIndex((c) => c >= MIN_PIXELS);
  if (first === -1) return null;
  const last = counts.findLastIndex((c) => c >= MIN_PIXELS);
  return [first, last + 1];
}

/** Tight box around the art inside `region`, or null when the region is empty. */
export function alphaBounds(px: Uint8Array, imageWidth: number, region: Rect): Rect | null {
  const xs = span(columnCoverage(px, imageWidth, region));
  const ys = span(rowCoverage(px, imageWidth, region));
  if (!xs || !ys) return null;
  return {
    x: region.x + xs[0],
    y: region.y + ys[0],
    width: xs[1] - xs[0],
    height: ys[1] - ys[0],
  };
}

/**
 * Index of the emptiest line in `counts[from, to)`. Ties go to the middle of the emptiest run, so the cut lands in
 * the centre of a gutter rather than against a cell's edge.
 */
export function findGutter(counts: ArrayLike<number>, from: number, to: number): number {
  let best = Number.POSITIVE_INFINITY;
  let runStart = from;
  let runEnd = from;
  for (let i = from; i < to; i++) {
    const c = counts[i] as number;
    if (c < best) {
      best = c;
      runStart = runEnd = i;
    } else if (c === best && runEnd === i - 1) {
      runEnd = i;
    }
  }
  return Math.floor((runStart + runEnd) / 2);
}

function cuts(counts: Uint32Array, parts: number): number[] {
  const size = counts.length;
  const slack = Math.floor(size / parts / 4);
  const result = [0];
  for (let k = 1; k < parts; k++) {
    const centre = Math.round((size * k) / parts);
    result.push(findGutter(counts, centre - slack, centre + slack + 1));
  }
  result.push(size);
  return result;
}

/**
 * Splits a character sheet into `cols × rows` cells, in reading order. Cuts snap to the emptiest gutter near each
 * nominal grid line, because generated sheets are never perfectly even.
 */
export function gridCells(
  px: Uint8Array,
  width: number,
  height: number,
  cols: number,
  rows: number,
): Rect[] {
  const whole = { x: 0, y: 0, width, height };
  const xCuts = cuts(columnCoverage(px, width, whole), cols);
  const yCuts = cuts(rowCoverage(px, width, whole), rows);
  const cells: Rect[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = xCuts[c] as number;
      const y = yCuts[r] as number;
      cells.push({
        x,
        y,
        width: (xCuts[c + 1] as number) - x,
        height: (yCuts[r + 1] as number) - y,
      });
    }
  }
  return cells;
}
