export type B2bNonCommercialContext =
  | 'BATHROOM_SANITARY_CORE'
  | 'KITCHEN_BUILT_IN_CORE'
  | 'LIVING_ROOM_TV';

export function allowEmptyCommercialSet(
  roomType: string,
  context: readonly string[] = [],
) {
  return (
    (roomType === 'BATHROOM' && context.includes('BATHROOM_SANITARY_CORE')) ||
    (roomType === 'KITCHEN' && context.includes('KITCHEN_BUILT_IN_CORE'))
  );
}

export function hasBuiltInNonCommercialCore(
  context: readonly string[] = [],
) {
  return (
    context.includes('BATHROOM_SANITARY_CORE') ||
    context.includes('KITCHEN_BUILT_IN_CORE')
  );
}

export function allowBedroomAccentSeating(areaM2?: number | null) {
  return typeof areaM2 === 'number' && Number.isFinite(areaM2) && areaM2 >= 14;
}
