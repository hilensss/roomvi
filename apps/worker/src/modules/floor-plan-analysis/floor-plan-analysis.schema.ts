const nullableString = { type: ['string', 'null'] };
const nullableNumber = { type: ['number', 'null'] };

export const floorPlanAnalysisJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    rooms: {
      type: 'array',
      maxItems: 40,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          sourceLabel: nullableString,
          suggestedName: { type: 'string' },
          roomType: {
            type: ['string', 'null'],
            enum: [
              'LIVING_ROOM',
              'BEDROOM',
              'KITCHEN',
              'KIDS_ROOM',
              'OFFICE',
              'HALLWAY',
              'BATHROOM',
              'STUDIO',
              null,
            ],
          },
          polygon: {
            type: 'array',
            minItems: 3,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                x: { type: 'number', minimum: 0, maximum: 1 },
                y: { type: 'number', minimum: 0, maximum: 1 },
              },
              required: ['x', 'y'],
            },
          },
          widthCm: nullableNumber,
          depthCm: nullableNumber,
          areaM2: nullableNumber,
          ceilingHeightCm: nullableNumber,
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          notes: nullableString,
          openings: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                kind: { type: 'string', enum: ['WINDOW', 'DOOR'] },
                wallSegmentIndex: { type: 'integer', minimum: 0 },
                positionRatio: {
                  type: 'number',
                  minimum: 0,
                  maximum: 1,
                },
                widthCm: nullableNumber,
                confidence: { type: 'number', minimum: 0, maximum: 1 },
              },
              required: [
                'kind',
                'wallSegmentIndex',
                'positionRatio',
                'widthCm',
                'confidence',
              ],
            },
          },
        },
        required: [
          'sourceLabel',
          'suggestedName',
          'roomType',
          'polygon',
          'widthCm',
          'depthCm',
          'areaM2',
          'ceilingHeightCm',
          'confidence',
          'notes',
          'openings',
        ],
      },
    },
  },
  required: ['rooms'],
} as const;
