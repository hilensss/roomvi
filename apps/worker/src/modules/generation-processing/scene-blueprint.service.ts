import { Injectable } from '@nestjs/common';
import { RoomType } from '@roomvi/database';
import type {
  NonCommercialContextItem,
  PlacementRule,
  RoomSpatialProfile,
  SceneBlueprint,
  SceneDensity,
  SceneRole,
  SceneRoleAvailability,
  SceneZone,
} from './product-curation.types.js';
import { allowBedroomAccentSeating } from './b2b-generation-policy.js';

export type ScenePlanningScenario = 'MARKETPLACE' | 'B2B_DEVELOPER';

export type SceneBlueprintRoomContext = {
  roomKey: string;
  roomType: RoomType;
  spatialProfile: RoomSpatialProfile;
  roleAvailability: SceneRoleAvailability;
};

type BlueprintBatchContext = {
  scenario: ScenePlanningScenario;
  rooms: SceneBlueprintRoomContext[];
  variantsCount: number;
};

type RoomRoleRules = {
  required: SceneRole[];
  preferred: SceneRole[];
  optional: SceneRole[];
};

const SCENE_ROLES: SceneRole[] = [
  'PRIMARY_ANCHOR',
  'SECONDARY_ANCHOR',
  'STORAGE',
  'BEDSIDE',
  'SURFACE',
  'TASK_LIGHTING',
  'AMBIENT_LIGHTING',
  'ACCENT_SEATING',
  'TEXTILE',
  'WALL_ACCENT',
  'DECOR',
];

const ROOM_ROLE_RULES: Partial<Record<RoomType, RoomRoleRules>> = {
  BEDROOM: {
    required: ['PRIMARY_ANCHOR'],
    preferred: ['STORAGE', 'BEDSIDE', 'TEXTILE'],
    optional: ['TASK_LIGHTING', 'ACCENT_SEATING', 'DECOR'],
  },
  LIVING_ROOM: {
    required: ['PRIMARY_ANCHOR'],
    preferred: ['SURFACE', 'STORAGE', 'TEXTILE'],
    optional: [
      'ACCENT_SEATING',
      'TASK_LIGHTING',
      'AMBIENT_LIGHTING',
      'DECOR',
    ],
  },
  HALLWAY: {
    required: ['STORAGE'],
    preferred: ['WALL_ACCENT', 'TASK_LIGHTING', 'AMBIENT_LIGHTING'],
    optional: ['ACCENT_SEATING', 'DECOR'],
  },
  BATHROOM: {
    required: [],
    preferred: ['WALL_ACCENT', 'AMBIENT_LIGHTING'],
    optional: ['DECOR'],
  },
  OFFICE: {
    required: ['SURFACE'],
    preferred: ['ACCENT_SEATING', 'STORAGE', 'TASK_LIGHTING'],
    optional: ['TEXTILE', 'WALL_ACCENT', 'DECOR'],
  },
  KIDS_ROOM: {
    required: ['PRIMARY_ANCHOR'],
    preferred: ['SURFACE', 'STORAGE', 'ACCENT_SEATING'],
    optional: ['TASK_LIGHTING', 'TEXTILE', 'DECOR'],
  },
  KITCHEN: {
    required: ['SURFACE'],
    preferred: ['ACCENT_SEATING', 'AMBIENT_LIGHTING'],
    optional: ['STORAGE', 'DECOR'],
  },
  STUDIO: {
    required: ['PRIMARY_ANCHOR'],
    preferred: ['SURFACE', 'STORAGE', 'TEXTILE'],
    optional: ['TASK_LIGHTING', 'ACCENT_SEATING', 'DECOR'],
  },
};

const DEFAULT_ROLE_RULES: RoomRoleRules = {
  required: [],
  preferred: ['PRIMARY_ANCHOR', 'SURFACE', 'STORAGE'],
  optional: ['TEXTILE', 'TASK_LIGHTING', 'DECOR'],
};

@Injectable()
export class SceneBlueprintService {
  buildResponseSchema(expectedCount?: number) {
    const roleSchema = { type: 'string', enum: SCENE_ROLES };
    return {
      type: 'object',
      additionalProperties: false,
      required: ['blueprints'],
      properties: {
        blueprints: {
          type: 'array',
          ...(expectedCount
            ? { minItems: expectedCount, maxItems: expectedCount }
            : {}),
          items: {
            type: 'object',
            additionalProperties: false,
            required: [
              'roomKey',
              'variantIndex',
              'designDirection',
              'density',
              'zones',
              'requiredRoles',
              'optionalRoles',
              'placementRules',
              'circulationRules',
            ],
            properties: {
              roomKey: { type: 'string' },
              variantIndex: { type: 'integer', minimum: 1, maximum: 8 },
              designDirection: { type: 'string', minLength: 3, maxLength: 80 },
              density: {
                type: 'string',
                enum: ['AIRY', 'BALANCED', 'LAYERED'],
              },
              zones: {
                type: 'array',
                minItems: 1,
                maxItems: 4,
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['name', 'purpose'],
                  properties: {
                    name: { type: 'string', maxLength: 40 },
                    purpose: { type: 'string', maxLength: 80 },
                  },
                },
              },
              requiredRoles: {
                type: 'array',
                maxItems: 6,
                items: roleSchema,
              },
              optionalRoles: {
                type: 'array',
                maxItems: 6,
                items: roleSchema,
              },
              placementRules: {
                type: 'array',
                maxItems: 8,
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['role', 'intent'],
                  properties: {
                    role: roleSchema,
                    intent: { type: 'string', maxLength: 100 },
                  },
                },
              },
              circulationRules: {
                type: 'array',
                maxItems: 5,
                items: { type: 'string', maxLength: 100 },
              },
            },
          },
        },
      },
    };
  }

  parseResponse(value: unknown): SceneBlueprint[] {
    const blueprints = this.asObject(value).blueprints;
    if (!Array.isArray(blueprints)) {
      throw new Error('Scene blueprint response is missing blueprints');
    }

    return blueprints.map((value) => this.parseBlueprint(value));
  }

  buildDeterministicBlueprints(
    context: BlueprintBatchContext,
  ): SceneBlueprint[] {
    const plans =
      context.scenario === 'MARKETPLACE'
        ? Array.from({ length: context.variantsCount }, (_, index) => ({
            room: context.rooms[0],
            variantIndex: index + 1,
          }))
        : context.rooms.map((room) => ({ room, variantIndex: 1 }));

    return plans.map(({ room, variantIndex }) =>
      this.buildDeterministicBlueprint(room, variantIndex, context.scenario),
    );
  }

  validateAndRepairBlueprints(
    context: BlueprintBatchContext,
    blueprints: SceneBlueprint[],
  ): SceneBlueprint[] {
    const expectedCount =
      context.scenario === 'MARKETPLACE'
        ? context.variantsCount
        : context.rooms.length;
    if (blueprints.length !== expectedCount) {
      throw new Error(
        `Expected ${expectedCount} scene blueprints, received ${blueprints.length}`,
      );
    }

    const roomByKey = new Map(context.rooms.map((room) => [room.roomKey, room]));
    const seen = new Set<string>();
    const repaired = blueprints.map((blueprint) => {
      const room = roomByKey.get(blueprint.roomKey);
      const key = `${blueprint.roomKey}:${blueprint.variantIndex}`;
      if (!room || seen.has(key)) {
        throw new Error('Scene blueprint has an unknown or duplicate mapping');
      }
      if (
        context.scenario === 'MARKETPLACE' &&
        (blueprint.variantIndex < 1 ||
          blueprint.variantIndex > context.variantsCount)
      ) {
        throw new Error('Scene blueprint has an invalid marketplace variant');
      }
      if (
        context.scenario === 'B2B_DEVELOPER' &&
        blueprint.variantIndex !== 1
      ) {
        throw new Error('Developer scene blueprint must use variantIndex=1');
      }
      if (
        room.spatialProfile.sizeClass === 'SMALL' &&
        blueprint.density === 'LAYERED'
      ) {
        throw new Error('Scene blueprint density is invalid for a small room');
      }
      seen.add(key);
      return this.repairBlueprint(blueprint, room, context.scenario);
    });

    if (context.scenario === 'MARKETPLACE' && repaired.length >= 4) {
      const signatures = new Set(repaired.map((plan) => this.signature(plan)));
      const densities = new Set(repaired.map(({ density }) => density));
      if (
        signatures.size < 3 ||
        !densities.has('AIRY') ||
        !densities.has('BALANCED') ||
        (context.rooms[0].spatialProfile.sizeClass !== 'SMALL' &&
          !densities.has('LAYERED'))
      ) {
        throw new Error('Marketplace blueprints lack conceptual diversity');
      }
    }

    return repaired;
  }

  private buildDeterministicBlueprint(
    room: SceneBlueprintRoomContext,
    variantIndex: number,
    scenario: ScenePlanningScenario,
  ): SceneBlueprint {
    const rules = this.getRoomRoleRules(room, scenario);
    const density = this.getFallbackDensity(
      variantIndex,
      room.spatialProfile.sizeClass,
    );
    const preferredCount = density === 'AIRY' ? 3 : density === 'BALANCED' ? 3 : 4;
    const optionalCount = density === 'AIRY' ? 0 : density === 'BALANCED' ? 1 : 3;
    const preferred = rules.preferred
      .filter((role) => this.isAvailable(role, room.roleAvailability))
      .slice(0, preferredCount);
    const optional = rules.optional
      .filter((role) => this.isAvailable(role, room.roleAvailability))
      .slice((variantIndex - 1) % Math.max(1, rules.optional.length))
      .concat(rules.optional)
      .filter((role, index, roles) => roles.indexOf(role) === index)
      .slice(0, optionalCount);
    const requiredRoles = this.uniqueRoles(rules.required);
    const optionalRoles = this.uniqueRoles(
      [...preferred, ...optional].filter((role) => !requiredRoles.includes(role)),
    );

    return {
      roomKey: room.roomKey,
      variantIndex,
      designDirection: this.getFallbackDirection(room.roomType, density, variantIndex),
      density,
      zones: this.getFallbackZones(room.roomType, variantIndex),
      requiredRoles,
      optionalRoles,
      placementRules: this.getFallbackPlacementRules(room.roomType, [
        ...requiredRoles,
        ...optionalRoles,
      ]),
      circulationRules: room.spatialProfile.circulationConstraints.slice(0, 5),
      nonCommercialContext: this.getNonCommercialContext(
        room.roomType,
        scenario,
      ),
      renderNarrative: this.buildRenderNarrative(room, scenario),
    };
  }

  private repairBlueprint(
    blueprint: SceneBlueprint,
    room: SceneBlueprintRoomContext,
    scenario: ScenePlanningScenario,
  ): SceneBlueprint {
    const rules = this.getRoomRoleRules(room, scenario);
    // Only domain-required roles are hard requirements. The model may suggest
    // supporting roles as "required", but forcing them causes bad SKU choices
    // (for example a 160 cm dresser used as a bedside object). Keep those
    // suggestions as optional design intent and let role-fit retrieval decide
    // whether a genuinely suitable product exists.
    const requiredRoles = this.uniqueRoles(rules.required).slice(0, 6);
    const aiSupportingRoles = blueprint.requiredRoles.filter(
      (role) =>
        SCENE_ROLES.includes(role) &&
        !requiredRoles.includes(role) &&
        this.isAvailable(role, room.roleAvailability),
    );
    const aiOptionalRoles = this.uniqueRoles(
      [...aiSupportingRoles, ...blueprint.optionalRoles].filter(
        (role) =>
          SCENE_ROLES.includes(role) &&
          !requiredRoles.includes(role) &&
          this.isAvailable(role, room.roleAvailability),
      ),
    );

    // B2B developer rooms stay catalog-first, but a valid blueprint still
    // needs enough executable support roles to avoid a visually empty one-SKU
    // room when suitable catalog products actually exist.
    const preferredRoleFloor =
      scenario === 'B2B_DEVELOPER'
        ? this.getB2bPreferredRoleFloor(room)
        : [];
    const optionalRoles = this.uniqueRoles([
      ...aiOptionalRoles,
      ...preferredRoleFloor.filter(
        (role) =>
          !requiredRoles.includes(role) &&
          this.isAvailable(role, room.roleAvailability),
      ),
    ]).slice(0, 6);
    const rawDirection = this.compact(blueprint.designDirection, 80);

    return {
      ...blueprint,
      designDirection: this.isGenericDirection(rawDirection, blueprint.density)
        ? this.getEditorialDirection(
            room.roomType,
            blueprint.density,
            blueprint.variantIndex,
          )
        : rawDirection,
      zones: blueprint.zones
        .map((zone) => ({
          name: this.compact(zone.name, 40),
          purpose: this.compact(zone.purpose, 80),
        }))
        .filter((zone) => zone.name && zone.purpose)
        .slice(0, 4),
      requiredRoles,
      optionalRoles,
      placementRules: blueprint.placementRules
        .filter((rule) =>
          [...requiredRoles, ...optionalRoles].includes(rule.role),
        )
        .map((rule) => ({
          role: rule.role,
          intent: this.compact(rule.intent, 100),
        }))
        .filter((rule) => rule.intent)
        .slice(0, 8),
      circulationRules: this.uniqueText([
        ...room.spatialProfile.circulationConstraints,
        ...blueprint.circulationRules,
      ]).slice(0, 5),
      nonCommercialContext: this.getNonCommercialContext(
        room.roomType,
        scenario,
      ),
      renderNarrative: this.buildRenderNarrative(room, scenario),
    };
  }

  private parseBlueprint(value: unknown): SceneBlueprint {
    const blueprint = this.asObject(value);
    if (
      typeof blueprint.roomKey !== 'string' ||
      !Number.isInteger(blueprint.variantIndex) ||
      typeof blueprint.designDirection !== 'string' ||
      !['AIRY', 'BALANCED', 'LAYERED'].includes(String(blueprint.density)) ||
      !Array.isArray(blueprint.zones) ||
      !Array.isArray(blueprint.requiredRoles) ||
      !Array.isArray(blueprint.optionalRoles) ||
      !Array.isArray(blueprint.placementRules) ||
      !Array.isArray(blueprint.circulationRules)
    ) {
      throw new Error('Scene blueprint shape is invalid');
    }

    return {
      roomKey: blueprint.roomKey,
      variantIndex: blueprint.variantIndex as number,
      designDirection: blueprint.designDirection,
      density: blueprint.density as SceneDensity,
      zones: blueprint.zones.map((zone) => {
        const parsed = this.asObject(zone);
        if (typeof parsed.name !== 'string' || typeof parsed.purpose !== 'string') {
          throw new Error('Scene zone shape is invalid');
        }
        return { name: parsed.name, purpose: parsed.purpose };
      }),
      requiredRoles: this.parseRoles(blueprint.requiredRoles),
      optionalRoles: this.parseRoles(blueprint.optionalRoles),
      placementRules: blueprint.placementRules.map((rule) => {
        const parsed = this.asObject(rule);
        if (
          !SCENE_ROLES.includes(parsed.role as SceneRole) ||
          typeof parsed.intent !== 'string'
        ) {
          throw new Error('Placement rule shape is invalid');
        }
        return { role: parsed.role as SceneRole, intent: parsed.intent };
      }),
      circulationRules: blueprint.circulationRules.filter(
        (rule): rule is string => typeof rule === 'string',
      ),
      nonCommercialContext: [],
    };
  }

  private parseRoles(value: unknown[]): SceneRole[] {
    if (!value.every((role) => SCENE_ROLES.includes(role as SceneRole))) {
      throw new Error('Scene role is invalid');
    }
    return value as SceneRole[];
  }

  private getFallbackDensity(
    variantIndex: number,
    sizeClass: RoomSpatialProfile['sizeClass'],
  ): SceneDensity {
    if (variantIndex === 1) return 'AIRY';
    if (variantIndex === 3 && sizeClass !== 'SMALL') return 'LAYERED';
    return 'BALANCED';
  }

  private isGenericDirection(value: string, density: SceneDensity) {
    const normalized = value.trim().toUpperCase();
    return (
      !normalized ||
      normalized === density ||
      ['AIRY', 'BALANCED', 'LAYERED', 'MODERN', 'MINIMAL'].includes(normalized)
    );
  }

  private getEditorialDirection(
    roomType: RoomType,
    density: SceneDensity,
    variantIndex: number,
  ) {
    const roomLabel = roomType.toLowerCase().replace(/_/g, ' ');
    const concepts =
      density === 'AIRY'
        ? [
            'calm open composition with warm residential softness',
            'light asymmetric composition with generous breathing room',
          ]
        : density === 'LAYERED'
          ? [
              'richly layered composition with tactile textiles and a clear secondary focal point',
              'warm editorial composition with purposeful visual depth',
            ]
          : [
              'balanced practical composition with a polished residential feel',
              'comfortable contemporary composition with purposeful supporting layers',
            ];
    return `${density.toLowerCase()} ${roomLabel}: ${concepts[(variantIndex - 1) % concepts.length]}`;
  }

  private getFallbackDirection(
    roomType: RoomType,
    density: SceneDensity,
    variantIndex: number,
  ) {
    const emphasis = ['open', 'practical', 'textured', 'expressive'][
      (variantIndex - 1) % 4
    ];
    return `${density.toLowerCase()}-${emphasis}-${roomType.toLowerCase()}`;
  }

  private getFallbackZones(roomType: RoomType, variantIndex: number): SceneZone[] {
    const primary: Partial<Record<RoomType, SceneZone>> = {
      BEDROOM: { name: 'sleep', purpose: 'primary sleeping composition' },
      LIVING_ROOM: { name: 'social', purpose: 'primary conversation composition' },
      HALLWAY: { name: 'entry', purpose: 'compact entry storage and transition' },
      BATHROOM: { name: 'sanitary', purpose: 'architectural sanitary context' },
      OFFICE: { name: 'work', purpose: 'focused working composition' },
      KIDS_ROOM: { name: 'sleep-study', purpose: 'safe sleep and study composition' },
      KITCHEN: { name: 'dining', purpose: 'functional dining composition' },
      STUDIO: { name: 'living', purpose: 'compact multifunctional composition' },
    };
    const zones = [primary[roomType] ?? { name: 'main', purpose: 'primary room function' }];
    if (variantIndex > 1) {
      zones.push({
        name: variantIndex === 3 ? 'accent' : 'support',
        purpose:
          variantIndex === 3
            ? 'layered secondary focal point'
            : 'practical supporting function',
      });
    }
    return zones;
  }

  private getFallbackPlacementRules(
    roomType: RoomType,
    roles: SceneRole[],
  ): PlacementRule[] {
    return roles.slice(0, 6).map((role) => ({
      role,
      intent:
        role === 'PRIMARY_ANCHOR'
          ? 'place on the primary usable solid wall'
          : role === 'STORAGE'
            ? roomType === RoomType.HALLWAY
              ? 'align compact storage near the entrance without blocking circulation'
              : 'align storage to a usable wall outside the main circulation path'
            : role === 'AMBIENT_LIGHTING'
              ? 'use only when the composition calls for restrained ambient lighting'
              : 'support the nearest functional zone without blocking circulation',
    }));
  }

  private getRoomRoleRules(
    room: SceneBlueprintRoomContext,
    scenario: ScenePlanningScenario,
  ): RoomRoleRules {
    const base = ROOM_ROLE_RULES[room.roomType] ?? DEFAULT_ROLE_RULES;

    if (
      scenario === 'B2B_DEVELOPER' &&
      room.roomType === RoomType.BEDROOM &&
      room.spatialProfile.sizeClass !== 'SMALL' &&
      this.isAvailable('SURFACE', room.roleAvailability)
    ) {
      const areaM2 = room.spatialProfile.areaM2;
      return {
        required: [...base.required],
        preferred: [...base.preferred],
        optional: this.uniqueRoles(['SURFACE', ...base.optional]).filter(
          (role) =>
            role !== 'ACCENT_SEATING' || allowBedroomAccentSeating(areaM2),
        ),
      };
    }

    if (
      scenario === 'B2B_DEVELOPER' &&
      room.roomType === RoomType.KITCHEN
    ) {
      return {
        required: [],
        preferred: this.uniqueRoles([
          'SURFACE',
          'ACCENT_SEATING',
          'AMBIENT_LIGHTING',
          'STORAGE',
        ]),
        optional: ['DECOR'],
      };
    }

    return {
      required: [...base.required],
      preferred: [...base.preferred],
      optional: [...base.optional],
    };
  }

  private buildRenderNarrative(
    room: SceneBlueprintRoomContext,
    scenario: ScenePlanningScenario,
  ): SceneBlueprint['renderNarrative'] {
    if (scenario !== 'B2B_DEVELOPER') return undefined;

    const spatial = room.spatialProfile;
    const wallSegments = spatial.wallSegments ?? [];
    const solidWalls = wallSegments.filter(
      (wall) => !wall.hasWindow && !wall.hasDoor && wall.usableCm > 0,
    );
    const openingWalls = wallSegments.filter(
      (wall) => wall.hasWindow || wall.hasDoor,
    );
    const footprint =
      spatial.widthCm && spatial.depthCm
        ? `${Math.round(spatial.widthCm)}×${Math.round(spatial.depthCm)} cm`
        : spatial.areaM2
          ? `${spatial.areaM2.toFixed(1)} m²`
          : null;
    const solidWallSummary = solidWalls
      .sort((left, right) => right.usableCm - left.usableCm)
      .slice(0, 3)
      .map(
        (wall) =>
          `wall ${wall.wallSegmentIndex} has about ${wall.usableCm}cm usable solid span`,
      )
      .join('; ');
    const openingSummary = openingWalls
      .slice(0, 4)
      .map((wall) => {
        const kinds = [
          wall.hasWindow ? 'window' : null,
          wall.hasDoor ? 'door/opening' : null,
        ]
          .filter(Boolean)
          .join('+');
        return `wall ${wall.wallSegmentIndex} contains ${kinds}`;
      })
      .join('; ');

    const geometryRules = Array.from(
      new Set(
        [
          footprint
            ? `Physical room footprint is ${footprint}; preserve this apparent scale and do not enlarge the room.`
            : '',
          ...(spatial.geometryContract ?? []),
          spatial.polygonPoints && spatial.polygonPoints > 4
            ? `Preserve the reviewed non-rectangular shell (${spatial.polygonPoints} perimeter segments); do not straighten it into a generic rectangle.`
            : 'Preserve the reviewed room shell and wall adjacency.',
          openingSummary
            ? `Opening layout: ${openingSummary}. Keep every opening on the same wall and in the same relative sequence.`
            : spatial.windowPositions.length === 0 &&
                spatial.doorPositions.length === 0
              ? 'Do not invent windows, doors or openings absent from the reviewed geometry.'
              : '',
          solidWallSummary
            ? `Usable furniture walls: ${solidWallSummary}.`
            : '',
          spatial.aspectRatio && spatial.aspectRatio >= 1.6
            ? `The room is elongated (aspect about ${spatial.aspectRatio.toFixed(2)}); preserve that narrow/long character rather than widening it.`
            : '',
        ]
          .map((value) => this.compact(value, 320))
          .filter(Boolean),
      ),
    ).slice(0, 8);

    const roomStory = this.getRoomStoryForContext(room);
    const focalRelationships = this.getRoomFocalRelationships(room);

    return {
      roomStory,
      geometryRules,
      cameraRule:
        room.roomType === RoomType.HALLWAY &&
        room.spatialProfile.sizeClass === 'SMALL'
          ? 'Use a close, physically believable camera for this very small entry space. Do not create a long-corridor perspective, widen the vestibule, or move the camera outside the reviewed shell.'
          : `The source-room reference is the camera and geometry authority: keep the same viewpoint and handedness. Preserve exactly ${spatial.exactDoorCount ?? spatial.doorPositions.length} door(s) and ${spatial.exactWindowCount ?? spatial.windowPositions.length} window(s); do not rotate, mirror, add, remove or relocate openings.`,
      focalRelationships,
    };
  }

  private getB2bPreferredRoleFloor(
    room: SceneBlueprintRoomContext,
  ): SceneRole[] {
    const available = (roles: SceneRole[]) =>
      roles.filter((role) => this.isAvailable(role, room.roleAvailability));

    switch (room.roomType) {
      case RoomType.BEDROOM: {
        const supports = available(['STORAGE', 'BEDSIDE', 'TEXTILE']);
        if (
          room.spatialProfile.sizeClass !== 'SMALL' &&
          this.isAvailable('SURFACE', room.roleAvailability)
        ) {
          supports.push('SURFACE');
        }
        return this.uniqueRoles(supports).slice(0, 3);
      }
      case RoomType.LIVING_ROOM:
        return available(['SURFACE', 'STORAGE', 'TEXTILE']).slice(0, 3);
      case RoomType.HALLWAY:
        return available(['WALL_ACCENT', 'TASK_LIGHTING', 'AMBIENT_LIGHTING'])
          .slice(0, room.spatialProfile.sizeClass === 'SMALL' ? 1 : 2);
      case RoomType.KITCHEN:
      case RoomType.BATHROOM:
        return [];
      default:
        return [];
    }
  }

  private getRoomStoryForContext(room: SceneBlueprintRoomContext) {
    if (
      room.roomType === RoomType.HALLWAY &&
      room.spatialProfile.sizeClass === 'SMALL'
    ) {
      const footprint =
        room.spatialProfile.widthCm && room.spatialProfile.depthCm
          ? `${Math.round(room.spatialProfile.widthCm)}×${Math.round(room.spatialProfile.depthCm)} cm`
          : 'a very small footprint';
      return `A very small entry vestibule (${footprint}), not a long corridor: preserve the cramped real proportions and door sequence, then integrate only compact selected catalog storage/wall accents.`;
    }
    return this.getRoomStory(room.roomType);
  }

  private getRoomStory(roomType: RoomType) {
    switch (roomType) {
      case RoomType.HALLWAY:
        return 'A compact transition space first: preserve the real entry sequence and door connections, then integrate only the selected catalog storage/mirror along usable walls.';
      case RoomType.BATHROOM:
        return 'A complete compact bathroom whose fixed sanitary core follows the real elongated shell and leaves the entrance path clear; catalog products remain exact overlays, not substitutes for the sanitary layout.';
      case RoomType.KITCHEN:
        return 'A complete kitchen first: the fixed built-in kitchen core anchors a real usable wall, while selected catalog dining/storage products are integrated around it without changing the shell.';
      case RoomType.LIVING_ROOM:
        return 'A real social/media living room: selected seating forms one coherent conversation group and, where a reviewed solid media wall exists, the sofa/viewing axis relates directly to it.';
      case RoomType.BEDROOM:
        return 'A calm bedroom centered on the selected bed, with storage on usable solid walls and an optional compact work corner only when the selected catalog plan actually contains a suitable surface/desk.';
      default:
        return 'Preserve the reviewed architectural shell first, then organize selected catalog products around the room function and circulation.';
    }
  }

  private getRoomFocalRelationships(room: SceneBlueprintRoomContext) {
    const spatial = room.spatialProfile;
    const relationships: string[] = [];

    if (room.roomType === RoomType.LIVING_ROOM) {
      if (spatial.mediaWallCandidate) {
        relationships.push(
          `Use reviewed wall ${spatial.mediaWallCandidate.wallSegmentIndex} (${spatial.mediaWallCandidate.usableCm}cm usable) as the media focal wall; orient the primary sofa/viewing direction toward it without blocking circulation.`,
        );
      }
      relationships.push(
        'Keep the social seating group compact and purposeful; do not scatter sofa, accent seating and surface objects along unrelated walls.',
      );
    }

    if (room.roomType === RoomType.HALLWAY) {
      relationships.push(
        spatial.sizeClass === 'SMALL'
          ? 'Treat this as a compact vestibule, not a corridor: keep the short center path free and place only compact selected storage/wall accents on a real usable wall without visually extending the room.'
          : 'Keep the corridor center empty; place selected storage on the longest opening-free wall and wall accents above/adjacent to it, never across a doorway.',
      );
    }

    if (room.roomType === RoomType.BATHROOM) {
      relationships.push(
        'Keep the entrance clear; organize the sanitary core linearly along solid walls, with the wettest zone toward the far end of the room rather than in the doorway path.',
      );
    }

    if (room.roomType === RoomType.KITCHEN) {
      relationships.push(
        'The built-in kitchen run must occupy a real solid wall and be visually unmistakable; selected dining furniture forms a secondary zone and must not replace the kitchen cabinetry.',
      );
    }

    return relationships.slice(0, 3);
  }

  private getNonCommercialContext(
    roomType: RoomType,
    scenario: ScenePlanningScenario,
  ): NonCommercialContextItem[] {
    if (scenario !== 'B2B_DEVELOPER') return [];

    switch (roomType) {
      case RoomType.BATHROOM:
        return ['BATHROOM_SANITARY_CORE'];
      case RoomType.KITCHEN:
        return ['KITCHEN_BUILT_IN_CORE'];
      case RoomType.LIVING_ROOM:
        return ['LIVING_ROOM_TV'];
      default:
        return [];
    }
  }

  private signature(blueprint: SceneBlueprint) {
    return JSON.stringify({
      density: blueprint.density,
      roles: [...blueprint.requiredRoles, ...blueprint.optionalRoles].sort(),
      zones: blueprint.zones.map(({ name, purpose }) => `${name}:${purpose}`).sort(),
      placement: blueprint.placementRules.map(({ role, intent }) => `${role}:${intent}`).sort(),
    });
  }

  private isAvailable(role: SceneRole, availability: SceneRoleAvailability) {
    return (availability[role] ?? 0) > 0;
  }

  private uniqueRoles(roles: SceneRole[]) {
    return Array.from(new Set(roles));
  }

  private uniqueText(values: string[]) {
    return Array.from(
      new Set(values.map((value) => this.compact(value, 100)).filter(Boolean)),
    );
  }

  private compact(value: string, maxLength: number) {
    return value.replace(/\s+/g, ' ').trim().slice(0, maxLength);
  }

  private asObject(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }
}
