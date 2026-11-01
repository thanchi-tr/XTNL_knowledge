/**
 * One stored image (or a picked photo's preview). A plain img: the photo route already serves each image at its
 * stored size (a thumbnail is at most 480 px), and the optimizer would fetch and re-encode a private photo. Width and
 * height are always given, so nothing shifts as it loads. No hooks.
 */
export function Photo({ src, width, height, alt, className, eager = false }: { src: string; width: number; height: number; alt: string; className?: string; eager?: boolean }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} width={width} height={height} alt={alt} className={className} loading={eager ? "eager" : "lazy"} decoding="async" />;
}
