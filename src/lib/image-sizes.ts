/**
 * Right-sized images for uploads served from `/api/files/...`.
 *
 * An admin uploads whatever the camera or designer produced — a 1.35 MB PNG
 * course cover is typical — and a phone showing it in a 320px card was
 * downloading all of it. `/api/files/<id>/<name>?w=640` returns the same image
 * resized to that width as WebP (typically 30–80 KB), and the CDN caches each
 * width forever, so the resize happens once per image per width.
 *
 * Only these widths are served, so nobody can make the server resize to
 * thousands of sizes; anything else is rounded up to the next one.
 */
export const IMAGE_WIDTHS = [64, 128, 256, 384, 640, 828, 1080, 1280, 1920] as const;

export function snapWidth(width: number): number {
  return IMAGE_WIDTHS.find((w) => w >= width) ?? IMAGE_WIDTHS[IMAGE_WIDTHS.length - 1];
}

function isStoredUpload(url: string): boolean {
  return url.startsWith("/api/files/") && !url.includes("?");
}

/**
 * The URL of `url` at roughly `width` CSS pixels wide. Stored uploads get the
 * resized variant; anything else (a pasted Pexels link, an SVG logo) is left
 * alone.
 */
export function sizedImage(url: string | null | undefined, width: number): string | undefined {
  if (!url) return undefined;
  if (!isStoredUpload(url) || /\.(svg|gif)$/i.test(url)) return url;
  return `${url}?w=${snapWidth(width)}`;
}

/**
 * `src` + `srcSet` for an `<img>` shown at `width` CSS pixels: 1x and 2x
 * variants, so a high-density phone screen stays sharp without anyone
 * downloading the original.
 */
export function imageProps(
  url: string | null | undefined,
  width: number,
): { src: string | undefined; srcSet?: string } {
  const src = sizedImage(url, width);
  if (!url || src === url) return { src };
  return { src, srcSet: `${sizedImage(url, width)} 1x, ${sizedImage(url, width * 2)} 2x` };
}
