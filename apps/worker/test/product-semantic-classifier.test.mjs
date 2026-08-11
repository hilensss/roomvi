import assert from 'node:assert/strict';
import test from 'node:test';
import { ProductCategory } from '@roomvi/database';

const semanticModule = await import(
  '../dist/modules/generation-processing/product-semantic-classifier.js'
).catch(() => ({}));

test('classifies a Russian pendant light as ceiling lighting', () => {
  const profile = semanticModule.classifyProductSemantics?.({
    category: ProductCategory.LAMP,
    title: 'Подвесной светильник Sphere Brass',
    description: null,
  });

  assert.deepEqual(profile, {
    functionRole: 'LIGHTING',
    placement: 'CEILING',
    subtype: 'PENDANT',
  });
});

test('classifies a Russian floor lamp as floor lighting', () => {
  let profile;
  assert.doesNotThrow(() => {
    profile = semanticModule.classifyProductSemantics({
      category: ProductCategory.LAMP,
      title: 'Торшер Valencia',
      description: null,
    });
  });

  assert.deepEqual(profile, {
    functionRole: 'LIGHTING',
    placement: 'FLOOR',
    subtype: 'FLOOR_LAMP',
  });
});

test('classifies a Russian table lamp as tabletop lighting', () => {
  let profile;
  assert.doesNotThrow(() => {
    profile = semanticModule.classifyProductSemantics({
      category: ProductCategory.LAMP,
      title: 'Настольная лампа Nora',
      description: null,
    });
  });

  assert.deepEqual(profile, {
    functionRole: 'LIGHTING',
    placement: 'TABLETOP',
    subtype: 'TABLE_LAMP',
  });
});

test('classifies a Russian wall sconce as wall lighting', () => {
  let profile;
  assert.doesNotThrow(() => {
    profile = semanticModule.classifyProductSemantics({
      category: ProductCategory.LAMP,
      title: 'Бра Mist',
      description: null,
    });
  });

  assert.deepEqual(profile, {
    functionRole: 'LIGHTING',
    placement: 'WALL',
    subtype: 'WALL_LAMP',
  });
});

test('classifies an unspecified lamp as generic lighting with unknown placement', () => {
  let profile;
  assert.doesNotThrow(() => {
    profile = semanticModule.classifyProductSemantics({
      category: ProductCategory.LAMP,
      title: 'Светильник Aurora',
      description: null,
    });
  });

  assert.deepEqual(profile, {
    functionRole: 'LIGHTING',
    placement: 'UNKNOWN',
    subtype: 'GENERIC_LAMP',
  });
});

test('classifies a bed as a freestanding anchor', () => {
  let profile;
  assert.doesNotThrow(() => {
    profile = semanticModule.classifyProductSemantics({
      category: ProductCategory.BED,
      title: 'Кровать Nova',
      description: null,
    });
  });

  assert.deepEqual(profile, {
    functionRole: 'ANCHOR',
    placement: 'FREESTANDING',
    subtype: 'BED',
  });
});

test('classifies a rug as a floor textile', () => {
  let profile;
  assert.doesNotThrow(() => {
    profile = semanticModule.classifyProductSemantics({
      category: ProductCategory.RUG,
      title: 'Ковёр Soft',
      description: null,
    });
  });

  assert.deepEqual(profile, {
    functionRole: 'TEXTILE',
    placement: 'FLOOR',
    subtype: 'RUG',
  });
});

test('classifies lighting semantics independently of locale case', () => {
  const profile = semanticModule.classifyProductSemantics({
    category: ProductCategory.LAMP,
    title: 'PENDANT LIGHT ORBIT',
    description: null,
  });

  assert.deepEqual(profile, {
    functionRole: 'LIGHTING',
    placement: 'CEILING',
    subtype: 'PENDANT',
  });
});

test('classifies supported English lighting subtypes deterministically', () => {
  const cases = [
    ['Crystal chandelier', 'CEILING', 'CHANDELIER'],
    ['Arc floor lamp', 'FLOOR', 'FLOOR_LAMP'],
    ['Ceramic table lamp', 'TABLETOP', 'TABLE_LAMP'],
    ['Reading wall sconce', 'WALL', 'WALL_LAMP'],
    ['Compact ceiling light', 'CEILING', 'CEILING_LIGHT'],
  ];

  for (const [title, placement, subtype] of cases) {
    assert.deepEqual(
      semanticModule.classifyProductSemantics({
        category: ProductCategory.LAMP,
        title,
        description: null,
      }),
      { functionRole: 'LIGHTING', placement, subtype },
    );
  }
});

test('maps core catalog categories to high-value semantic roles', () => {
  const cases = [
    [ProductCategory.SOFA, 'ANCHOR'],
    [ProductCategory.WARDROBE, 'STORAGE'],
    [ProductCategory.DRESSER, 'STORAGE'],
    [ProductCategory.TV_STAND, 'STORAGE'],
    [ProductCategory.SHELF, 'STORAGE'],
    [ProductCategory.COFFEE_TABLE, 'SURFACE'],
    [ProductCategory.TABLE, 'SURFACE'],
    [ProductCategory.DESK, 'SURFACE'],
    [ProductCategory.ARMCHAIR, 'SEATING'],
    [ProductCategory.CHAIR, 'SEATING'],
    [ProductCategory.BENCH, 'SEATING'],
    [ProductCategory.DECOR, 'DECOR'],
  ];

  for (const [category, functionRole] of cases) {
    let profile;
    assert.doesNotThrow(() => {
      profile = semanticModule.classifyProductSemantics({
        category,
        title: `Product ${category}`,
        description: null,
      });
    });
    assert.equal(profile.functionRole, functionRole);
  }
});

test('uses safe unknown semantics for an unmapped catalog category', () => {
  let profile;
  assert.doesNotThrow(() => {
    profile = semanticModule.classifyProductSemantics({
      category: ProductCategory.OTHER,
      title: 'Unknown catalog item',
      description: null,
    });
  });

  assert.deepEqual(profile, {
    functionRole: 'OTHER',
    placement: 'UNKNOWN',
    subtype: ProductCategory.OTHER,
  });
});

test('maps products to one or more scene-planning roles deterministically', () => {
  const cases = [
    [ProductCategory.BED, 'Кровать', ['PRIMARY_ANCHOR']],
    [ProductCategory.SOFA, 'Диван', ['PRIMARY_ANCHOR']],
    [ProductCategory.WARDROBE, 'Шкаф', ['STORAGE']],
    [ProductCategory.DRESSER, 'Комод', ['STORAGE', 'BEDSIDE']],
    [ProductCategory.COFFEE_TABLE, 'Журнальный стол', ['SURFACE']],
    [ProductCategory.DESK, 'Рабочий стол', ['SURFACE']],
    [ProductCategory.ARMCHAIR, 'Кресло', ['ACCENT_SEATING']],
    [ProductCategory.RUG, 'Ковёр', ['TEXTILE']],
    [ProductCategory.MIRROR, 'Зеркало', ['WALL_ACCENT']],
    [ProductCategory.DECOR, 'Декор', ['DECOR']],
  ];

  for (const [category, title, roles] of cases) {
    assert.deepEqual(
      semanticModule.classifyProductSceneRoles?.({
        category,
        title,
        description: null,
      }),
      roles,
    );
  }
});

test('maps lighting subtypes to task and ambient scene roles', () => {
  const cases = [
    ['Настольная лампа Nora', ['TASK_LIGHTING']],
    ['Торшер Arc', ['TASK_LIGHTING']],
    ['Бра Mist', ['TASK_LIGHTING', 'AMBIENT_LIGHTING']],
    ['Подвесной светильник Sphere', ['AMBIENT_LIGHTING']],
    ['Потолочный светильник Cloud', ['AMBIENT_LIGHTING']],
  ];

  for (const [title, roles] of cases) {
    assert.deepEqual(
      semanticModule.classifyProductSceneRoles?.({
        category: ProductCategory.LAMP,
        title,
        description: null,
      }),
      roles,
    );
  }
});
