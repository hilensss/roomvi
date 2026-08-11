import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GenerationScenario,
  ProductCategory,
  RoomType,
  StockStatus,
  type Product,
} from '@roomvi/database';
import { PrismaService } from '../prisma/prisma.service.js';
import { ReasoningAiService } from '../reasoning-ai/reasoning-ai.service.js';
import { ReasoningAiProviderError } from '../reasoning-ai/reasoning-ai-provider.interface.js';
import {
  type BuildProductSetParams,
  ProductMatchingService,
  type RoleSelectionValidationResult,
} from './product-matching.service.js';
import type {
  CuratedProductPlan,
  CuratedScenePlan,
  ProductCurationRoomInput,
  ProductScenePlan,
  RoleCandidateGroup,
  RoomSpatialProfile,
  SceneBlueprint,
  ScenePlacementHint,
  SceneRole,
  SceneRoleAssignment,
} from './product-curation.types.js';
import { RoomSpatialProfileService } from './room-spatial-profile.service.js';
import {
  SceneBlueprintService,
  type SceneBlueprintRoomContext,
  type ScenePlanningScenario,
} from './scene-blueprint.service.js';
import { classifyProductSemantics } from './product-semantic-classifier.js';

type FallbackReason =
  | 'DISABLED'
  | 'TIMEOUT'
  | 'NETWORK'
  | 'INVALID_JSON'
  | 'SCHEMA'
  | 'VALIDATION'
  | 'PROVIDER';

type PreparedRoom = SceneBlueprintRoomContext & {
  input: ProductCurationRoomInput;
};

type PreparedScene = {
  room: PreparedRoom;
  blueprint: SceneBlueprint;
  candidateGroups: RoleCandidateGroup[];
};

type PersistedCuration = {
  mode: CuratedProductPlan['curationMode'];
  scenePlan: ProductScenePlan;
};

type AiPhaseMetadata = {
  provider: string;
  model: string;
  serializedInputChars: number;
  outputChars: number;
};

class ProductPlanningFailure extends Error {
  constructor(
    readonly reason: FallbackReason,
    message: string,
  ) {
    super(message);
    this.name = 'ProductPlanningFailure';
  }
}

@Injectable()
export class ProductCurationService {
  private readonly logger = new Logger(ProductCurationService.name);
  private readonly developerProjectInflight = new Map<
    string,
    Promise<Map<string, CuratedProductPlan>>
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly reasoningAi: ReasoningAiService,
    private readonly productMatching: ProductMatchingService,
    private readonly spatialProfiles: RoomSpatialProfileService,
    private readonly sceneBlueprints: SceneBlueprintService =
      new SceneBlueprintService(),
  ) {}

  async curateMarketplace(
    input: ProductCurationRoomInput & { hasSourceImage?: boolean },
    variantsCount: number,
  ): Promise<CuratedProductPlan[]> {
    const room = await this.prepareRoom(
      { ...input, scenario: GenerationScenario.MARKETPLACE },
      input.hasSourceImage,
    );
    return this.planScenes({
      scenario: 'MARKETPLACE',
      rooms: [room],
      variantsCount,
    });
  }

  async getDeveloperRoomPlan(input: {
    projectId: string;
    roomId: string;
    generationJobId: string;
  }): Promise<CuratedProductPlan> {
    const persisted = await this.loadPersistedDeveloperPlan(input);
    if (persisted) return persisted;

    const existing = this.developerProjectInflight.get(input.projectId);
    const promise =
      existing ?? this.planAndPersistDeveloperProject(input.projectId);
    if (!existing) this.developerProjectInflight.set(input.projectId, promise);

    try {
      const plans = await promise;
      const plan = plans.get(input.roomId);
      if (!plan) {
        throw new ProductPlanningFailure(
          'SCHEMA',
          `No product plan was prepared for room ${input.roomId}`,
        );
      }
      return plan;
    } finally {
      if (this.developerProjectInflight.get(input.projectId) === promise) {
        this.developerProjectInflight.delete(input.projectId);
      }
    }
  }

  private async planAndPersistDeveloperProject(projectId: string) {
    const project = await this.prisma.b2BProject.findUnique({
      where: { id: projectId },
      include: {
        rooms: {
          where: { isIncluded: true, roomType: { not: null } },
          orderBy: { sortOrder: 'asc' },
          include: {
            openings: true,
            generationJobs: {
              where: { scenario: GenerationScenario.B2B_DEVELOPER_ROOM },
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        },
      },
    });
    if (!project || project.rooms.length === 0) {
      throw new ProductPlanningFailure(
        'SCHEMA',
        'Developer project has no included typed rooms',
      );
    }

    const rooms = await Promise.all(
      project.rooms.map((room) =>
        this.prepareRoom({
          scenario: GenerationScenario.B2B_DEVELOPER_ROOM,
          roomKey: room.id,
          roomType: room.roomType as RoomType,
          style: room.styleOverride ?? project.style,
          supplierId: project.supplierId ?? undefined,
          widthCm: room.widthCm ?? undefined,
          depthCm: room.depthCm ?? undefined,
          areaM2: room.areaM2 ?? undefined,
          ceilingHeightCm:
            room.ceilingHeightCm ?? project.defaultCeilingHeightCm,
          polygon: room.polygon,
          openings: room.openings,
          b2bProjectContext: {
            projectName: project.name,
            developerName: project.partnerName,
          },
        }),
      ),
    );
    const plans = await this.planScenes({
      scenario: 'B2B_DEVELOPER',
      rooms,
      variantsCount: 1,
    });
    const planByRoom = new Map(
      plans.map((plan) => [plan.scenePlan.roomKey, plan]),
    );

    await Promise.all(
      project.rooms.map(async (room) => {
        const job = room.generationJobs[0];
        const plan = planByRoom.get(room.id);
        if (!job || !plan) return;
        await this.prisma.generationJob.update({
          where: { id: job.id },
          data: {
            inputParams: {
              ...this.asObject(job.inputParams),
              productCuration: {
                mode: plan.curationMode,
                scenePlan: plan.scenePlan,
              },
            },
          },
        });
      }),
    );

    return planByRoom;
  }

  private async loadPersistedDeveloperPlan(input: {
    roomId: string;
    generationJobId: string;
  }) {
    const job = await this.prisma.generationJob.findUnique({
      where: { id: input.generationJobId },
      include: {
        b2bRoom: { include: { openings: true, b2bProject: true } },
      },
    });
    const persisted = this.readPersistedCuration(job?.inputParams);
    const room = job?.b2bRoom;
    if (!persisted || !room?.roomType || persisted.scenePlan.roomKey !== input.roomId) {
      return null;
    }

    const products = await this.prisma.product.findMany({
      where: {
        id: { in: persisted.scenePlan.selectedProductIds },
        isActive: true,
        isAiEligible: true,
        stockStatus: StockStatus.IN_STOCK,
        imageUrls: { isEmpty: false },
        ...(room.b2bProject.supplierId
          ? { supplierId: room.b2bProject.supplierId }
          : {}),
      },
    });
    const productById = new Map(products.map((product) => [product.id, product]));
    const orderedProducts = persisted.scenePlan.selectedProductIds
      .map((productId) => productById.get(productId))
      .filter((product): product is Product => Boolean(product));
    if (orderedProducts.length !== persisted.scenePlan.selectedProductIds.length) {
      return null;
    }

    return {
      curationMode: persisted.mode,
      scenePlan: persisted.scenePlan,
      spatialProfile: this.spatialProfiles.build({
        widthCm: room.widthCm ?? undefined,
        depthCm: room.depthCm ?? undefined,
        areaM2: room.areaM2 ?? undefined,
        ceilingHeightCm:
          room.ceilingHeightCm ?? room.b2bProject.defaultCeilingHeightCm,
        polygon: room.polygon,
        openings: room.openings,
      }),
      products: orderedProducts,
      totalPrice: orderedProducts.reduce((sum, product) => sum + product.price, 0),
      missingRequiredCategories: [],
    } satisfies CuratedProductPlan;
  }

  private async prepareRoom(
    input: ProductCurationRoomInput,
    hasSourceImage = false,
  ): Promise<PreparedRoom> {
    const spatialProfile = this.spatialProfiles.build({
      widthCm: input.widthCm,
      depthCm: input.depthCm,
      areaM2: input.areaM2,
      ceilingHeightCm: input.ceilingHeightCm,
      polygon: input.polygon,
      openings: input.openings,
      hasSourceImage,
    });
    const roleAvailability = await this.productMatching.buildSceneRoleAvailability(
      this.toMatchingParams(input, 1),
    );
    return {
      input: { ...input, hasSourceImage },
      roomKey: input.roomKey,
      roomType: input.roomType,
      spatialProfile,
      roleAvailability,
    };
  }

  private async planScenes(input: {
    scenario: ScenePlanningScenario;
    rooms: PreparedRoom[];
    variantsCount: number;
  }): Promise<CuratedProductPlan[]> {
    const totalStartedAt = Date.now();
    const requestedPlanCount =
      input.scenario === 'MARKETPLACE'
        ? input.variantsCount
        : input.rooms.length;
    const context = {
      scenario: input.scenario,
      rooms: input.rooms,
      variantsCount: input.variantsCount,
    };

    if (!this.isEnabled()) {
      const blueprints = this.sceneBlueprints.buildDeterministicBlueprints(context);
      const scenes = await this.retrieveCandidates(input.rooms, blueprints);
      const plans = scenes.map((scene) =>
        this.buildFallbackPlan(scene, 'DETERMINISTIC_ONLY', 'DISABLED'),
      );
      this.logger.log(
        `Product planning completed: mode=DETERMINISTIC_ONLY scenario=${input.scenario} plans=${plans.length} durationMs=${Date.now() - totalStartedAt}`,
      );
      return plans;
    }

    let blueprintMode: 'AI' | 'FALLBACK' = 'AI';
    let blueprintFallbackReason: FallbackReason | undefined;
    let blueprintMetadata: AiPhaseMetadata | undefined;
    const blueprintStartedAt = Date.now();
    let blueprints: SceneBlueprint[];
    try {
      const result = await this.executeBlueprintPhase(input);
      blueprints = result.blueprints;
      blueprintMetadata = result.metadata;
    } catch (error) {
      blueprintMode = 'FALLBACK';
      blueprintFallbackReason = this.classifyFailure(error);
      blueprints = this.sceneBlueprints.buildDeterministicBlueprints(context);
      this.logger.warn(
        `Product planning fallback: phase=SCENE_BLUEPRINT scenario=${input.scenario} reason=${blueprintFallbackReason} durationMs=${Date.now() - blueprintStartedAt}`,
      );
    }
    const sceneBlueprintMs = Date.now() - blueprintStartedAt;
    this.logger.log(
      `Scene blueprint completed: mode=${blueprintMode} scenario=${input.scenario} rooms=${input.rooms.length} variants=${requestedPlanCount} durationMs=${sceneBlueprintMs}${blueprintMetadata ? ` provider=${blueprintMetadata.provider} model=${blueprintMetadata.model}` : ''}`,
    );
    this.logBlueprints(blueprints);

    const candidateStartedAt = Date.now();
    const scenes = await this.retrieveCandidates(input.rooms, blueprints);
    const candidateRetrievalMs = Date.now() - candidateStartedAt;
    const candidateIdsByRoom = new Map<string, Set<string>>();
    for (const scene of scenes) {
      const productIds =
        candidateIdsByRoom.get(scene.blueprint.roomKey) ?? new Set<string>();
      for (const product of scene.candidateGroups.flatMap(({ products }) => products)) {
        productIds.add(product.id);
      }
      candidateIdsByRoom.set(scene.blueprint.roomKey, productIds);
    }
    const candidateCount = Array.from(candidateIdsByRoom.values()).reduce(
      (sum, productIds) => sum + productIds.size,
      0,
    );

    const skuStartedAt = Date.now();
    try {
      const result = await this.executeSkuPhase(input, scenes);
      const skuCurationMs = Date.now() - skuStartedAt;
      const plans = result.plans.map(({ scene, selection }) =>
        this.toCuratedProductPlan({
          scene,
          selection,
          mode:
            blueprintMode === 'FALLBACK'
              ? 'DETERMINISTIC_FALLBACK'
              : selection.repairOperations.length > 0
                ? 'AI_CURATED_REPAIRED'
                : 'AI_CURATED',
          fallbackReason: blueprintFallbackReason,
          model: result.metadata.model,
          durationMs: Date.now() - totalStartedAt,
        }),
      );
      this.logger.log(
        `SKU curation completed: mode=AI scenario=${input.scenario} variants=${plans.length} candidateCount=${candidateCount} selectedCount=${plans.reduce((sum, plan) => sum + plan.products.length, 0)} durationMs=${skuCurationMs} provider=${result.metadata.provider} model=${result.metadata.model}`,
      );
      this.logger.log(
        `Product planning timings: scenario=${input.scenario} sceneBlueprintMs=${sceneBlueprintMs} candidateRetrievalMs=${candidateRetrievalMs} skuCurationMs=${skuCurationMs} totalMs=${Date.now() - totalStartedAt}`,
      );
      this.logSkuPlans(plans);
      return plans;
    } catch (error) {
      const skuFallbackReason = this.classifyFailure(error);
      const skuCurationMs = Date.now() - skuStartedAt;
      this.logger.warn(
        `Product planning fallback: phase=SKU_CURATION scenario=${input.scenario} reason=${skuFallbackReason} durationMs=${skuCurationMs}`,
      );
      const plans = scenes.map((scene) =>
        this.buildFallbackPlan(
          scene,
          'DETERMINISTIC_FALLBACK',
          blueprintFallbackReason ?? skuFallbackReason,
          Date.now() - totalStartedAt,
        ),
      );
      this.logger.log(
        `SKU curation completed: mode=FALLBACK scenario=${input.scenario} variants=${plans.length} candidateCount=${candidateCount} selectedCount=${plans.reduce((sum, plan) => sum + plan.products.length, 0)} durationMs=${skuCurationMs}`,
      );
      this.logger.log(
        `Product planning timings: scenario=${input.scenario} sceneBlueprintMs=${sceneBlueprintMs} candidateRetrievalMs=${candidateRetrievalMs} skuCurationMs=${skuCurationMs} totalMs=${Date.now() - totalStartedAt}`,
      );
      this.logSkuPlans(plans);
      return plans;
    }
  }

  private async executeBlueprintPhase(input: {
    scenario: ScenePlanningScenario;
    rooms: PreparedRoom[];
    variantsCount: number;
  }) {
    const payload = {
      scenario: input.scenario,
      variants: input.scenario === 'MARKETPLACE' ? input.variantsCount : 1,
      rooms: input.rooms.map((room) => ({
        roomKey: room.roomKey,
        roomType: room.input.roomType,
        style: room.input.style,
        budget: {
          min: room.input.budgetMin ?? null,
          max: room.input.budgetMax ?? null,
        },
        sourceImageAvailable: Boolean(room.input.hasSourceImage),
        spatialProfile: room.spatialProfile,
        roleAvailability: room.roleAvailability,
        b2bProjectContext: room.input.b2bProjectContext ?? null,
      })),
    };
    const userPrompt = JSON.stringify(payload);
    const result = await this.reasoningAi.generateStructured({
      taskName: 'scene_blueprint_design',
      systemPrompt: this.buildBlueprintSystemPrompt(),
      userPrompt,
      jsonSchema: this.sceneBlueprints.buildResponseSchema(
        input.scenario === 'MARKETPLACE'
          ? input.variantsCount
          : input.rooms.length,
      ),
      attachments: [],
      model: this.getModel(),
      reasoningEffort: 'low',
      timeoutMs: this.getTimeoutMs(),
      maxOutputTokens: 1_600,
      maxAttempts: 1,
      apiMode: this.getApiMode(),
    });
    const parsed = this.sceneBlueprints.parseResponse(result.data);
    let blueprints: SceneBlueprint[];
    try {
      blueprints = this.sceneBlueprints.validateAndRepairBlueprints(
        {
          scenario: input.scenario,
          rooms: input.rooms,
          variantsCount: input.variantsCount,
        },
        parsed,
      );
    } catch (error) {
      throw new ProductPlanningFailure(
        'VALIDATION',
        error instanceof Error ? error.message : 'Scene blueprint validation failed',
      );
    }
    return {
      blueprints,
      metadata: this.phaseMetadata(result, userPrompt),
    };
  }

  private async retrieveCandidates(
    rooms: PreparedRoom[],
    blueprints: SceneBlueprint[],
  ): Promise<PreparedScene[]> {
    const roomByKey = new Map(rooms.map((room) => [room.roomKey, room]));
    const blueprintsByRoom = new Map<string, SceneBlueprint[]>();
    for (const blueprint of blueprints) {
      const roomBlueprints = blueprintsByRoom.get(blueprint.roomKey) ?? [];
      roomBlueprints.push(blueprint);
      blueprintsByRoom.set(blueprint.roomKey, roomBlueprints);
    }
    const candidateGroupsByRoom = new Map<string, RoleCandidateGroup[]>();
    await Promise.all(
      Array.from(blueprintsByRoom.entries()).map(
        async ([roomKey, roomBlueprints]) => {
          const room = roomByKey.get(roomKey);
          if (!room) {
            throw new ProductPlanningFailure(
              'SCHEMA',
              `No room context exists for blueprint ${roomKey}`,
            );
          }
          const requestedRoles = Array.from(
            new Set(
              roomBlueprints.flatMap((blueprint) => [
                ...blueprint.requiredRoles,
                ...blueprint.optionalRoles,
              ]),
            ),
          );
          const candidateGroups =
            await this.productMatching.buildRoleCandidateGroups(
              this.toMatchingParams(room.input, 1),
              {
                ...roomBlueprints[0],
                requiredRoles: requestedRoles,
                optionalRoles: [],
              },
            );
          candidateGroupsByRoom.set(roomKey, candidateGroups);
        },
      ),
    );

    return blueprints.map((blueprint) => {
      const room = roomByKey.get(blueprint.roomKey);
      if (!room) {
        throw new ProductPlanningFailure(
          'SCHEMA',
          `No room context exists for blueprint ${blueprint.roomKey}`,
        );
      }
      const requestedRoles = new Set([
        ...blueprint.requiredRoles,
        ...blueprint.optionalRoles,
      ]);
      const candidateGroups = (
        candidateGroupsByRoom.get(blueprint.roomKey) ?? []
      ).filter(({ role }) => requestedRoles.has(role));
      return { room, blueprint, candidateGroups };
    });
  }

  private async executeSkuPhase(
    input: { scenario: ScenePlanningScenario },
    scenes: PreparedScene[],
  ) {
    const candidateGroupsByRoom = new Map<
      string,
      Map<SceneRole, RoleCandidateGroup>
    >();
    for (const scene of scenes) {
      const roleGroups =
        candidateGroupsByRoom.get(scene.blueprint.roomKey) ??
        new Map<SceneRole, RoleCandidateGroup>();
      for (const group of scene.candidateGroups) roleGroups.set(group.role, group);
      candidateGroupsByRoom.set(scene.blueprint.roomKey, roleGroups);
    }
    const payload = {
      scenario: input.scenario,
      blueprints: scenes.map(({ blueprint }) => blueprint),
      rooms: Array.from(candidateGroupsByRoom.entries()).map(
        ([roomKey, roleGroups]) => ({
          roomKey,
          candidateGroups: Array.from(roleGroups.values()).map(
            ({ role, products }) => ({
              role,
              products: products.map((product) => this.compactProduct(product)),
            }),
          ),
        }),
      ),
    };
    const userPrompt = JSON.stringify(payload);
    const result = await this.reasoningAi.generateStructured({
      taskName: 'scene_sku_curation',
      systemPrompt: this.buildSkuSystemPrompt(),
      userPrompt,
      jsonSchema: this.buildSkuResponseSchema(scenes.length),
      attachments: [],
      model: this.getModel(),
      reasoningEffort: 'low',
      timeoutMs: this.getTimeoutMs(),
      maxOutputTokens: 1_600,
      maxAttempts: 1,
      apiMode: this.getApiMode(),
    });
    const rawPlans = this.parseSkuPlans(result.data);
    if (rawPlans.length !== scenes.length) {
      throw new ProductPlanningFailure(
        'SCHEMA',
        `Expected ${scenes.length} SKU plans, received ${rawPlans.length}`,
      );
    }
    if (input.scenario === 'MARKETPLACE' && rawPlans.length >= 4) {
      const rawProductSignatures = new Set(
        rawPlans.map(({ selectedProductIds }) =>
          [...selectedProductIds].sort().join('|'),
        ),
      );
      if (rawProductSignatures.size === 1) {
        throw new ProductPlanningFailure(
          'VALIDATION',
          'Marketplace SKU plans repeat the same exact product set',
        );
      }
    }
    const sceneByKey = new Map(
      scenes.map((scene) => [
        `${scene.blueprint.roomKey}:${scene.blueprint.variantIndex}`,
        scene,
      ]),
    );
    const seen = new Set<string>();
    const plans = rawPlans.map((plan) => {
      const key = `${plan.roomKey}:${plan.variantIndex}`;
      const scene = sceneByKey.get(key);
      if (!scene || seen.has(key)) {
        throw new ProductPlanningFailure(
          'SCHEMA',
          'SKU plan has an unknown or duplicate scene mapping',
        );
      }
      seen.add(key);
      const planWithLocalHints: CuratedScenePlan = {
        ...plan,
        placementHints: this.buildPlacementHints(
          scene.blueprint,
          plan.roleAssignments,
        ),
      };
      const selection = this.productMatching.validateAndRepairRoleSelection(
        this.toMatchingParams(scene.room.input, scene.blueprint.variantIndex),
        scene.blueprint,
        scene.candidateGroups,
        planWithLocalHints,
      );
      if (!selection.productSet) {
        throw new ProductPlanningFailure(
          'VALIDATION',
          `SKU plan for ${key} cannot satisfy required scene roles`,
        );
      }
      return { scene, selection };
    });

    if (input.scenario === 'MARKETPLACE' && plans.length >= 4) {
      const productSignatures = new Set(
        plans.map(({ selection }) =>
          selection.productSet?.products
            .map(({ id }) => id)
            .sort()
            .join('|'),
        ),
      );
      if (productSignatures.size === 1) {
        throw new ProductPlanningFailure(
          'VALIDATION',
          'Marketplace SKU plans lack product-set diversity',
        );
      }
    }

    return {
      plans,
      metadata: this.phaseMetadata(result, userPrompt),
    };
  }

  private buildFallbackPlan(
    scene: PreparedScene,
    mode: 'DETERMINISTIC_ONLY' | 'DETERMINISTIC_FALLBACK',
    fallbackReason: FallbackReason,
    durationMs = 0,
  ): CuratedProductPlan {
    const selection = this.productMatching.buildDeterministicRoleSelection(
      this.toMatchingParams(scene.room.input, scene.blueprint.variantIndex),
      scene.blueprint,
      scene.candidateGroups,
    );
    if (!selection.productSet) {
      throw new ProductPlanningFailure(
        'VALIDATION',
        `Deterministic role matching failed for ${scene.blueprint.roomKey}`,
      );
    }
    return this.toCuratedProductPlan({
      scene,
      selection,
      mode,
      fallbackReason,
      model: this.getModel(),
      durationMs,
    });
  }

  private toCuratedProductPlan(input: {
    scene: PreparedScene;
    selection: RoleSelectionValidationResult;
    mode: CuratedProductPlan['curationMode'];
    fallbackReason?: FallbackReason;
    model: string;
    durationMs: number;
  }): CuratedProductPlan {
    if (!input.selection.productSet) {
      throw new ProductPlanningFailure('VALIDATION', 'Product set is missing');
    }
    const scenePlan: ProductScenePlan = {
      ...input.scene.blueprint,
      selectedProductIds: input.selection.productSet.products.map(({ id }) => id),
      roleAssignments: input.selection.roleAssignments,
      placementHints: input.selection.placementHints,
    };
    return {
      curationMode: input.mode,
      ...(input.fallbackReason ? { fallbackReason: input.fallbackReason } : {}),
      curatorModel: input.model,
      curationDurationMs: input.durationMs,
      scenePlan,
      spatialProfile: input.scene.room.spatialProfile,
      ...input.selection.productSet,
    };
  }

  private buildBlueprintSystemPrompt() {
    return [
      'Design interior scene blueprints without selecting or naming products.',
      'Return structured decisions only and never reveal reasoning.',
      'designDirection must be a concrete 5-12 word visual concept, not a density label and never a compass direction; describe mood, balance and styling character, e.g. warm airy contemporary bedroom with asymmetric bedside styling.',
      'Respect room type, style, budget, role availability, source geometry, openings and circulation.',
      'For MARKETPLACE return all requested variants in one response with meaningful conceptual diversity: include AIRY and BALANCED, plus LAYERED when room size permits.',
      'For B2B_DEVELOPER return one blueprint per room in one response and keep project style coherent.',
      'Bedrooms require PRIMARY_ANCHOR. For B2B_DEVELOPER, when suitable catalog roles exist, keep the bedroom commercially complete rather than anchor-only: normally include STORAGE plus BEDSIDE or TEXTILE; in medium/large rooms SURFACE may be an additional compact work zone only when a real catalog DESK is available and circulation remains comfortable. Pendant lighting is optional, never required.',
      'Living rooms require PRIMARY_ANCHOR. For B2B_DEVELOPER, when available, compose a real purchasable support set around it: SURFACE plus at least one of STORAGE or TEXTILE, with ACCENT_SEATING only when space allows. A wall-mounted TV may be non-commercial context only when the room has a sofa-led composition and a suitable solid wall; all furniture around it still comes from catalog roles.',
      'Hallways are functional entry scenes, not lounges and must remain catalog-first. Very small hallways may legitimately use only one compact commercial storage item, but do not compensate by visually enlarging the room. For B2B_DEVELOPER bathrooms, only essential sanitary fixtures are non-commercial context. For B2B_DEVELOPER kitchens, only the built-in kitchen core (cabinetry/worktop/sink/fixed appliances) may be non-commercial; freestanding furniture must stay catalog-backed.',
      'Use only available roles, except deterministic room-required roles. Placement rules must be visual and actionable: describe the main focal wall, balance of tall/low masses, grounding textile scale, local lighting and preserved circulation instead of generic phrases.',
    ].join(' ');
  }

  private buildSkuSystemPrompt() {
    return [
      'Select concrete catalog product IDs for every scene blueprint.',
      'Return only role-to-product assignments; selected IDs and placement hints are derived locally.',
      'Return structured decisions only, no explanations.',
      'Choose IDs only from the candidate group for the assigned role.',
      'Prefer products whose physical scale truly fits the requested role: adult beds over narrow single beds for medium bedrooms, compact bedside pieces over wide dressers, and room-scale rugs over tiny accent mats.',
      'Preserve blueprint required roles, density, zones, placement and circulation intent. For B2B_DEVELOPER bedrooms and living rooms, do not collapse a blueprint with available supporting roles into an anchor-only SKU plan: assign suitable catalog products to the executable support roles already present in the blueprint.',
      'Do not maximize product count. AIRY may use 4-5 products; LAYERED may use more only when requested and spatially sane.',
      'Respect budget, room compatibility, product dimensions, category caps and supplier-scoped candidates.',
      'Do not choose a pendant for TASK_LIGHTING. Choose ceiling lighting only for AMBIENT_LIGHTING and at most once.',
      'For MARKETPLACE make the four SKU plans meaningfully different while retaining one user style.',
      'For B2B_DEVELOPER return all room plans in one response.',
    ].join(' ');
  }

  private buildSkuResponseSchema(expectedCount: number) {
    const roleSchema = {
      type: 'string',
      enum: [
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
      ],
    };
    return {
      type: 'object',
      additionalProperties: false,
      required: ['plans'],
      properties: {
        plans: {
          type: 'array',
          minItems: expectedCount,
          maxItems: expectedCount,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['roomKey', 'variantIndex', 'assignments'],
            properties: {
              roomKey: { type: 'string' },
              variantIndex: { type: 'integer', minimum: 1, maximum: 8 },
              assignments: {
                type: 'array',
                minItems: 1,
                maxItems: 10,
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['role', 'productId'],
                  properties: {
                    role: roleSchema,
                    productId: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    };
  }

  private parseSkuPlans(value: unknown): CuratedScenePlan[] {
    const plans = this.asObject(value).plans;
    if (!Array.isArray(plans)) {
      throw new ProductPlanningFailure('SCHEMA', 'SKU response plans are missing');
    }
    return plans.map((value) => {
      const plan = this.asObject(value);
      const rawAssignments = Array.isArray(plan.assignments)
        ? plan.assignments
        : plan.roleAssignments; // backwards-compatible persisted scene plans
      if (
        typeof plan.roomKey !== 'string' ||
        !Number.isInteger(plan.variantIndex) ||
        !Array.isArray(rawAssignments)
      ) {
        throw new ProductPlanningFailure('SCHEMA', 'SKU plan shape is invalid');
      }
      const roleAssignments = rawAssignments.map((assignment) =>
        this.parseRoleAssignment(assignment),
      );
      return {
        roomKey: plan.roomKey,
        variantIndex: plan.variantIndex as number,
        selectedProductIds: roleAssignments.map(({ productId }) => productId),
        roleAssignments,
        placementHints: Array.isArray(plan.placementHints)
          ? plan.placementHints.map((hint) => this.parsePlacementHint(hint))
          : [],
      };
    });
  }

  private parseRoleAssignment(value: unknown): SceneRoleAssignment {
    const assignment = this.asObject(value);
    if (
      !this.isSceneRole(assignment.role) ||
      typeof assignment.productId !== 'string'
    ) {
      throw new ProductPlanningFailure('SCHEMA', 'Role assignment is invalid');
    }
    return {
      role: assignment.role,
      productId: assignment.productId,
    };
  }

  private parsePlacementHint(value: unknown): ScenePlacementHint {
    const hint = this.asObject(value);
    if (!this.isSceneRole(hint.role) || typeof hint.hint !== 'string') {
      throw new ProductPlanningFailure('SCHEMA', 'Placement hint is invalid');
    }
    return {
      role: hint.role,
      ...(typeof hint.productId === 'string' ? { productId: hint.productId } : {}),
      hint: this.compactText(hint.hint, 100) ?? 'support the functional zone',
    };
  }

  private buildPlacementHints(
    blueprint: SceneBlueprint,
    assignments: SceneRoleAssignment[],
  ): ScenePlacementHint[] {
    const intentByRole = new Map(
      blueprint.placementRules.map(({ role, intent }) => [role, intent]),
    );
    return assignments
      .map(({ role, productId }) => ({
        role,
        productId,
        hint:
          intentByRole.get(role) ??
          (role === 'PRIMARY_ANCHOR'
            ? 'anchor the main functional zone with natural scale and breathing room'
            : 'integrate naturally into its functional zone without showroom spacing'),
      }))
      .slice(0, 8);
  }

  private compactProduct(product: Product) {
    const semantics = classifyProductSemantics(product);
    return [
      product.id,
      product.category,
      product.price,
      this.compactDimensions(product),
      this.compactText(product.material, 24),
      this.compactText(product.color, 20),
      product.styleTags.slice(0, 3),
      this.compactText(product.title, 48),
      semantics.subtype ?? null,
      semantics.placement,
    ];
  }

  private phaseMetadata(
    result: { provider: string; model: string; data: unknown },
    userPrompt: string,
  ): AiPhaseMetadata {
    return {
      provider: result.provider,
      model: result.model,
      serializedInputChars: userPrompt.length,
      outputChars: JSON.stringify(result.data).length,
    };
  }

  private logBlueprints(blueprints: SceneBlueprint[]) {
    for (const blueprint of blueprints) {
      this.logger.log(
        `Scene blueprint: roomKey=${blueprint.roomKey} variant=${blueprint.variantIndex} designDirection=${this.compactText(blueprint.designDirection, 80) ?? 'n/a'} density=${blueprint.density} roles=${[...blueprint.requiredRoles, ...blueprint.optionalRoles].join(',') || 'none'}`,
      );
    }
  }

  private logSkuPlans(plans: CuratedProductPlan[]) {
    for (const plan of plans) {
      this.logger.log(
        `SKU plan: roomKey=${plan.scenePlan.roomKey} variant=${plan.scenePlan.variantIndex} products=${plan.products.length} roles=${plan.scenePlan.roleAssignments.map(({ role }) => role).join(',') || 'none'}`,
      );
    }
  }

  private toMatchingParams(
    input: ProductCurationRoomInput,
    variantNumber: number,
  ): BuildProductSetParams {
    return {
      scenario: input.scenario,
      roomType: input.roomType,
      style: input.style,
      budgetMin: input.budgetMin,
      budgetMax: input.budgetMax,
      widthCm: input.widthCm,
      depthCm: input.depthCm,
      areaM2: input.areaM2,
      supplierId: input.supplierId,
      variantNumber,
    };
  }

  private readPersistedCuration(value: unknown): PersistedCuration | null {
    const productCuration = this.asObject(
      this.asObject(value).productCuration,
    );
    const scenePlan = this.asObject(productCuration.scenePlan);
    try {
      const blueprint = this.sceneBlueprints.parseResponse({
        blueprints: [scenePlan],
      })[0];
      const curated = this.parseSkuPlans({ plans: [scenePlan] })[0];
      return {
        mode: this.isCurationMode(productCuration.mode)
          ? productCuration.mode
          : 'DETERMINISTIC_FALLBACK',
        scenePlan: {
          ...blueprint,
          ...curated,
        },
      };
    } catch {
      return null;
    }
  }

  private classifyFailure(error: unknown): FallbackReason {
    if (error instanceof ProductPlanningFailure) return error.reason;
    if (error instanceof ReasoningAiProviderError) {
      const message = error.message.toLowerCase();
      if (message.includes('timed out')) return 'TIMEOUT';
      if (message.includes('transport')) return 'NETWORK';
      if (
        message.includes('invalid structured') ||
        message.includes('invalid response body')
      ) {
        return 'INVALID_JSON';
      }
      return 'PROVIDER';
    }
    return 'PROVIDER';
  }

  private compactDimensions(product: Product) {
    if (!product.widthCm || !product.depthCm) return null;
    return product.heightCm
      ? `W${product.widthCm}xH${product.heightCm}xD${product.depthCm}`
      : `W${product.widthCm}xD${product.depthCm}`;
  }

  private compactText(value: string | null | undefined, maxLength: number) {
    if (!value) return null;
    const compact = value.replace(/\s+/g, ' ').trim();
    return compact.length <= maxLength
      ? compact
      : `${compact.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…`;
  }

  private isSceneRole(value: unknown): value is SceneRole {
    return [
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
    ].includes(String(value));
  }

  private isCurationMode(
    value: unknown,
  ): value is CuratedProductPlan['curationMode'] {
    return [
      'AI_CURATED',
      'AI_CURATED_REPAIRED',
      'DETERMINISTIC',
      'DETERMINISTIC_ONLY',
      'DETERMINISTIC_FALLBACK',
    ].includes(String(value));
  }

  private asObject(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private isEnabled() {
    return (
      this.configService.get<string>('PRODUCT_CURATION_AI_ENABLED') ?? 'true'
    ).toLowerCase() !== 'false';
  }

  private getModel() {
    return (
      this.configService.get<string>('PRODUCT_CURATION_AI_MODEL') ??
      'gpt-4.1-mini'
    );
  }

  private getApiMode(): 'responses' | 'chat_completions' {
    return this.configService.get<string>('PRODUCT_CURATION_AI_API_MODE') ===
      'responses'
      ? 'responses'
      : 'chat_completions';
  }

  private getTimeoutMs() {
    const value = Number(
      this.configService.get<string>('PRODUCT_CURATION_AI_TIMEOUT_MS') ??
        30_000,
    );
    return Number.isFinite(value)
      ? Math.max(1_000, Math.min(value, 60_000))
      : 30_000;
  }
}
