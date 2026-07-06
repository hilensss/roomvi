import Image, { type ImageProps } from 'next/image';

function shouldUseUnoptimized(src: ImageProps['src']) {
  if (typeof src !== 'string') {
    return false;
  }

  return src.includes('placehold.co');
}

export function SafeImage(props: ImageProps) {
  return (
    <Image
      {...props}
      unoptimized={props.unoptimized ?? shouldUseUnoptimized(props.src)}
    />
  );
}
