import React, { useState } from 'react';
import type { KitVisualSpec } from '../../lib/commerce';
import { JerseyVisualizer } from '../JerseyVisualizer';

export interface ResponsiveImageProps {
  productId: string;
  alt: string;
  src?: string | null;
  imageUrls?: string[];
  primaryImage?: string | null;
  visual?: KitVisualSpec;
  team?: string;
  className?: string;
  imageClassName?: string;
  sizes?: string;
  priority?: boolean;
  fallbackColor?: string;
  onClick?: () => void;
}

export const ResponsiveImage: React.FC<ResponsiveImageProps> = ({
  productId,
  alt,
  src,
  imageUrls,
  primaryImage,
  visual,
  team = 'Jersey Valley',
  className = '',
  imageClassName = '',
  sizes = '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw',
  priority = false,
  fallbackColor = '#F7F7F5',
  onClick
}) => {
  const [isLoaded, setIsLoaded] = useState(priority);
  const [hasError, setHasError] = useState(false);

  // Determine explicit image URL if supplied
  const explicitSrc = src || primaryImage || (imageUrls && imageUrls.length > 0 ? imageUrls[0] : null);
  const isDirectUrl = explicitSrc && (
    explicitSrc.startsWith('http://') ||
    explicitSrc.startsWith('https://') ||
    explicitSrc.startsWith('data:image/') ||
    explicitSrc.startsWith('blob:')
  );

  const basePath = `/images/products/${productId}`;
  const avifSrcSet = `${basePath}-400w.avif 400w, ${basePath}-800w.avif 800w, ${basePath}-1024w.avif 1024w`;
  const webpSrcSet = `${basePath}-400w.webp 400w, ${basePath}-800w.webp 800w, ${basePath}-1024w.webp 1024w`;
  const jpgSrcSet = `${basePath}-400w.jpg 400w, ${basePath}-800w.jpg 800w, ${basePath}-1024w.jpg 1024w`;
  const fallbackSrc = isDirectUrl ? explicitSrc : `${basePath}-800w.jpg`;

  if (hasError && visual) {
    return (
      <div
        className={`relative overflow-hidden aspect-square select-none ${className}`}
        style={{ backgroundColor: fallbackColor }}
        onClick={onClick}
      >
        <JerseyVisualizer
          visual={visual}
          team={team}
          view="front"
          className="w-full h-full"
        />
      </div>
    );
  }

  return (
    <div
      className={`relative overflow-hidden aspect-square select-none ${className}`}
      style={{ backgroundColor: fallbackColor }}
      onClick={onClick}
    >
      {/* Loading Skeleton / Pulse for lazy images */}
      {!priority && !isLoaded && !hasError && (
        <div className="absolute inset-0 bg-[#EAEAE6] animate-pulse pointer-events-none" />
      )}

      {isDirectUrl ? (
        <img
          src={explicitSrc!}
          alt={alt}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          fetchPriority={priority ? 'high' : 'auto'}
          referrerPolicy="no-referrer"
          onLoad={() => setIsLoaded(true)}
          onError={() => setHasError(true)}
          className={`w-full h-full object-cover ${
            priority
              ? 'opacity-100'
              : `transition-opacity duration-300 ${isLoaded ? 'opacity-100' : 'opacity-0'}`
          } ${imageClassName}`}
        />
      ) : (
        <picture className="w-full h-full block">
          <source type="image/avif" srcSet={avifSrcSet} sizes={sizes} />
          <source type="image/webp" srcSet={webpSrcSet} sizes={sizes} />
          <img
            src={fallbackSrc}
            srcSet={jpgSrcSet}
            sizes={sizes}
            alt={alt}
            width={800}
            height={800}
            loading={priority ? 'eager' : 'lazy'}
            decoding="async"
            fetchPriority={priority ? 'high' : 'auto'}
            referrerPolicy="no-referrer"
            onLoad={() => setIsLoaded(true)}
            onError={() => setHasError(true)}
            className={`w-full h-full object-cover ${
              priority
                ? 'opacity-100'
                : `transition-opacity duration-300 ${isLoaded ? 'opacity-100' : 'opacity-0'}`
            } ${imageClassName}`}
          />
        </picture>
      )}
    </div>
  );
};
