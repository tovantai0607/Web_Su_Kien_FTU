import { useCallback, useEffect, useState } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Button, Modal } from '@ftu/ui';
import { useMotionDisabled } from './MotionSystem';

export type GalleryPhoto = {
  src: string;
  alt: string;
  caption: string;
  width: number;
  height: number;
};

/** shadcn/ui Carousel's Embla structure/keyboard pattern, adapted to our shared UI.
 * Copyright (c) 2023 shadcn, MIT — docs/licenses/shadcn-ui.txt. */
export default function PhotoCarousel({
  photos,
  label,
}: {
  photos: GalleryPhoto[];
  label: string;
}) {
  const disabled = useMotionDisabled();
  const [viewport, api] = useEmblaCarousel({ loop: false, duration: disabled ? 0 : 25 });
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const sync = useCallback(() => setIndex(api?.selectedScrollSnap() ?? 0), [api]);
  useEffect(() => {
    if (!api) return;
    sync();
    api.on('select', sync).on('reInit', sync);
    return () => {
      api.off('select', sync).off('reInit', sync);
    };
  }, [api, sync]);
  if (!photos.length) return null;
  return (
    <section
      className="photo-carousel"
      aria-roledescription="băng chuyền ảnh"
      aria-label={label}
      tabIndex={0}
      onKeyDown={(event) => {
        if (open) return;
        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          event.currentTarget.focus();
          api?.scrollPrev(disabled);
        }
        if (event.key === 'ArrowRight') {
          event.preventDefault();
          event.currentTarget.focus();
          api?.scrollNext(disabled);
        }
      }}
    >
      <div className="carousel-viewport" ref={viewport}>
        <div className="carousel-container">
          {photos.map((photo, i) => (
            <div
              className="carousel-slide"
              key={photo.src}
              role="group"
              aria-roledescription="ảnh"
              aria-label={`${i + 1} / ${photos.length}`}
              inert={i !== index}
            >
              <button
                className="gallery-image"
                onClick={() => {
                  setIndex(i);
                  setOpen(true);
                }}
                aria-label={`Mở ${photo.alt}`}
              >
                <img
                  src={photo.src}
                  alt={photo.alt}
                  width={photo.width}
                  height={photo.height}
                  loading="lazy"
                  decoding="async"
                />
                <span>{photo.caption}</span>
              </button>
            </div>
          ))}
        </div>
      </div>
      {photos.length > 1 && (
        <div className="carousel-controls">
          <Button
            variant="outline"
            aria-label="Ảnh trước"
            disabled={index === 0}
            onClick={() => api?.scrollPrev(disabled)}
          >
            <ArrowLeft size={18} />
          </Button>
          <span role="status">
            {index + 1} / {photos.length}
          </span>
          <Button
            variant="outline"
            aria-label="Ảnh tiếp theo"
            disabled={index === photos.length - 1}
            onClick={() => api?.scrollNext(disabled)}
          >
            <ArrowRight size={18} />
          </Button>
        </div>
      )}
      <Modal open={open} onOpenChange={setOpen} title={photos[index]?.caption ?? label}>
        {photos[index] && (
          <img
            className="lightbox-image"
            src={photos[index].src}
            alt={photos[index].alt}
            width={photos[index].width}
            height={photos[index].height}
          />
        )}
      </Modal>
    </section>
  );
}
