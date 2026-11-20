(() => {
  const cards = Array.from(document.querySelectorAll('.venues__grid .venue-card'));
  const out = [];
  for (const card of cards) {
    const media = card.querySelector('.venue-card__media');
    const img = card.querySelector('.venue-card__media > img');
    if (!media || !img) continue;

    const mRect = media.getBoundingClientRect();
    const iRect = img.getBoundingClientRect();
    const mStyle = getComputedStyle(media);
    const iStyle = getComputedStyle(img);

    // The gold inner frame is the ::before pseudo element.
    const beforeStyle = getComputedStyle(media, '::before');

    // Natural size of the loaded image.
    const natW = img.naturalWidth;
    const natH = img.naturalHeight;

    out.push({
      title: (card.querySelector('.venue-card__title') || {}).textContent,
      media: {
        w: +mRect.width.toFixed(2),
        h: +mRect.height.toFixed(2),
        top: +mRect.top.toFixed(2),
        left: +mRect.left.toFixed(2),
        padding: mStyle.padding,
        border: mStyle.borderTopWidth,
        boxSizing: mStyle.boxSizing,
        aspectRatio: mStyle.aspectRatio,
        overflow: mStyle.overflow,
      },
      img: {
        w: +iRect.width.toFixed(2),
        h: +iRect.height.toFixed(2),
        top: +iRect.top.toFixed(2),
        left: +iRect.left.toFixed(2),
        natural: `${natW}x${natH}`,
        objectFit: iStyle.objectFit,
        objectPosition: iStyle.objectPosition,
      },
      // Gaps between the photo edge and the media box edges.
      gapTop: +(iRect.top - mRect.top).toFixed(2),
      gapBottom: +(mRect.bottom - iRect.bottom).toFixed(2),
      gapLeft: +(iRect.left - mRect.left).toFixed(2),
      gapRight: +(mRect.right - iRect.right).toFixed(2),
      frameInset: {
        top: beforeStyle.top,
        left: beforeStyle.left,
        right: beforeStyle.right,
        bottom: beforeStyle.bottom,
        borderWidth: beforeStyle.borderTopWidth,
      },
      viewport: { w: window.innerWidth, h: window.innerHeight },
      docScrollW: document.documentElement.scrollWidth,
    });
  }
  return out;
})()
