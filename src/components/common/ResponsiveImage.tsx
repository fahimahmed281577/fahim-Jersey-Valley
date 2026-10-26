import React, { useState } from 'react';

export interface ResponsiveImageProps {
  productId: string;
  alt: string;
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
  className = '',
  imageClassName = '',
  sizes = '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw',
  priority = false,
  fallbackColor = '#F7F7F5',
  onClick
}) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  const basePath = `/images/products/${productId}`;
  const avifSrcSet = `${basePath}-400w.avif 400w, ${basePath}-800w.avif 800w, ${basePath}-1024w.avif 1024w`;
  const webpSrcSet = `${basePath}-400w.webp 400w, ${basePath}-800w.webp 800w, ${basePath}-1024w.webp 1024w`;
  const jpgSrcSet = `${basePath}-400w.jpg 400w, ${basePath}-800w.jpg 800w, ${basePath}-1024w.jpg 1024w`;
  const fallbackSrc = `${basePath}.jpg`;

  return (
    <div
      className={`relative overflow-hidden aspect-square select-none ${className}`}
      style={{ backgroundColor: fallbackColor }}
      onClick={onClick}
    >
      {/* Loading Skeleton / Pulse */}
      {!isLoaded && !hasError && (
        <div className="absolute inset-0 bg-[#EAEAE6] animate-pulse pointer-events-none" />
      )}

      <picture className="w-full h-full block">
        <source type="image/avif" srcSet={avifSrcSet} sizes={sizes} />
        <source type="image/webp" srcSet={webpSrcSet} sizes={sizes} />
        <img
          src={fallbackSrc}
          srcSet={jpgSrcSet}
          sizes={sizes}
          alt={alt}
          width={1024}
          height={1024}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          referrerPolicy="no-referrer"
          onLoad={() => setIsLoaded(true)}
          onError={() => setHasError(true)}
          className={`w-full h-full object-cover transition-opacity duration-300 ${
            isLoaded ? 'opacity-100' : 'opacity-0'
          } ${imageClassName}`}
        />
      </picture>
    </div>
  );
};
