import React from 'react';

export interface LumosContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  as?: React.ElementType;
}

export const LumosContainer: React.FC<LumosContainerProps> = ({
  as: Component = 'div',
  className = '',
  children,
  ...props
}) => {
  return (
    <Component className={`lumos-container ${className}`} {...props}>
      {children}
    </Component>
  );
};

export interface LumosSectionProps extends React.HTMLAttributes<HTMLElement> {
  size?: 'normal' | 'large';
}

export const LumosSection: React.FC<LumosSectionProps> = ({
  size = 'normal',
  className = '',
  children,
  ...props
}) => {
  const sectionClass = size === 'large' ? 'lumos-section-lg' : 'lumos-section';
  return (
    <section className={`${sectionClass} ${className}`} {...props}>
      {children}
    </section>
  );
};

export interface LumosGridProps extends React.HTMLAttributes<HTMLDivElement> {
  cols?: 2 | 3 | 4;
}

export const LumosGrid: React.FC<LumosGridProps> = ({
  cols = 3,
  className = '',
  children,
  ...props
}) => {
  const colClass =
    cols === 2
      ? 'grid-cols-1 sm:grid-cols-2'
      : cols === 4
      ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
      : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';
  return (
    <div className={`lumos-grid ${colClass} ${className}`} {...props}>
      {children}
    </div>
  );
};
