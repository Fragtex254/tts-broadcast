import React, { useState } from 'react';

interface PresetCharacterImageProps {
  src: string;
  className: string;
  alt?: string;
}

export const PresetCharacterImage: React.FC<PresetCharacterImageProps> = ({
  src,
  className,
  alt = '',
}) => {
  const [hasError, setHasError] = useState(false);

  return (
    <div className={`flex items-center justify-center overflow-hidden ${className}`}>
      {hasError ? (
        <span className="px-3 text-center font-body text-[11px] leading-5 text-ink-soft/55">
          立绘缺失
        </span>
      ) : (
        <img
          src={src}
          alt={alt}
          className="h-full w-full object-contain"
          onError={() => setHasError(true)}
        />
      )}
    </div>
  );
};

export default PresetCharacterImage;
