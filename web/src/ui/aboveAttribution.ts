/**
 * Keep a bottom-anchored element just above the map attribution, which must
 * stay visible (ODbL) and wraps to several lines on phones.
 */
export function keepAboveAttribution(el: HTMLElement, gapPx = 10): () => void {
  const place = () => {
    const attrib = document.querySelector('.maplibregl-ctrl-attrib');
    const top = attrib?.getBoundingClientRect().top;
    el.style.bottom = top ? `${Math.max(12, window.innerHeight - top + gapPx)}px` : '';
  };
  const attrib = document.querySelector('.maplibregl-ctrl-attrib');
  if (attrib && 'ResizeObserver' in window) new ResizeObserver(place).observe(attrib);
  window.addEventListener('resize', place);
  return place;
}
