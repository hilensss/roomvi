import Image, { type ImageProps } from 'next/image';

function shouldUseUnoptimized(src: ImageProps['src']) {
  if (typeof src !== 'string') {
    return false;
  }

  return src.includes('placehold.co');
}

export function SafeImage({ alt, ...props }: ImageProps) {
  return (
    <Image
      {...props}
      alt={alt}
      unoptimized={props.unoptimized ?? shouldUseUnoptimized(props.src)}
    />
  );
}
