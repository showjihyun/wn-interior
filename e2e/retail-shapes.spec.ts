import { expect, test, type Locator, type Page } from '@playwright/test'

async function readBoxShape(page: Page, shapeKind: string) {
  return page.evaluate((expectedShapeKind) => {
    let result: any = null
    ;(window as any).__hp3d_scene.traverse((object: any) => {
      if (object.userData?.shapeKind !== expectedShapeKind) return
      const meshes = object.children.filter((child: any) => child.geometry?.type === 'BoxGeometry')
      const bounds = meshes.reduce(
        (current: any, mesh: any) => {
          const { width, height, depth } = mesh.geometry.parameters
          current.minX = Math.min(current.minX, mesh.position.x - width / 2)
          current.maxX = Math.max(current.maxX, mesh.position.x + width / 2)
          current.minY = Math.min(current.minY, mesh.position.y - height / 2)
          current.maxY = Math.max(current.maxY, mesh.position.y + height / 2)
          current.minZ = Math.min(current.minZ, mesh.position.z - depth / 2)
          current.maxZ = Math.max(current.maxZ, mesh.position.z + depth / 2)
          return current
        },
        {
          minX: Number.POSITIVE_INFINITY,
          maxX: Number.NEGATIVE_INFINITY,
          minY: Number.POSITIVE_INFINITY,
          maxY: Number.NEGATIVE_INFINITY,
          minZ: Number.POSITIVE_INFINITY,
          maxZ: Number.NEGATIVE_INFINITY,
        }
      )
      result = { ...object.userData, meshCount: meshes.length, bounds }
    })
    return result
  }, shapeKind)
}

async function expectRetailTexture(page: Page, card: Locator, textureUrl: string) {
  await page.waitForFunction(
    (expectedTextureUrl) =>
      (window as any).__hp3d_texture_stats?.().loadedUrls.includes(expectedTextureUrl),
    textureUrl,
    { timeout: 15_000 }
  )
  await expect(card.locator('[data-render-source="decal-fallback"]')).toBeVisible()
}

test('IKEA KIVIK을 공식 좌석폭·깊이·높이와 2개 쿠션의 낮은 팔걸이 소파로 렌더한다', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(String(error).slice(0, 300)))
  await page.route('**/__local-mesh-review__/**/mesh.glb', (route) =>
    route.fulfill({ status: 404, body: 'force KIVIK parametric fallback' })
  )
  await page.goto('/')
  await page.waitForFunction(() => !!(window as any).__hp3d_store && !!(window as any).__hp3d_scene)
  await page.getByRole('button', { name: /거실/ }).click()
  const card = page.locator('.pcard', { hasText: /IKEA KIVIK 쉬비크 3인용소파/ })
  await expect(card).toContainText('KIVIK 694.848.73')
  await expect(card).toContainText('699,000원')
  await expect(card).toContainText('W228cm · D950mm · H830mm')

  await page.evaluate(() => {
    window.__hp3d_store.setState({ placements: [] })
    window.__hp3d_store.getState().addPlacement('ik-kivik-3seat', { x: 9000, z: 5000 })
  })
  await page.waitForFunction(() => {
    let found = false
    ;(window as any).__hp3d_scene.traverse((object: any) => {
      if (
        object.userData?.shapeKind === 'kivikSofa' &&
        object.userData?.seatWidth === 1800 &&
        object.userData?.seatDepth === 600 &&
        object.userData?.seatHeight === 450 &&
        object.userData?.seatCushionCount === 2
      ) {
        found = true
      }
    })
    return found
  })
  const shape = await readBoxShape(page, 'kivikSofa')
  expect(shape).toMatchObject({
    seatWidth: 1800,
    seatDepth: 600,
    seatHeight: 450,
    armWidth: 240,
    seatCushionCount: 2,
    backCushionCount: 2,
    meshCount: 12,
  })
  expect(shape.bounds).toEqual({
    minX: -1140,
    maxX: 1140,
    minY: 0,
    maxY: 830,
    minZ: -475,
    maxZ: 475,
  })
  await expectRetailTexture(page, card, '/catalog/ikea/kivik-3seat.jpg')
  await page.getByRole('button', { name: /가격/ }).click()
  await expect(page.locator('.cost-total b')).toHaveText('699,000원')
  expect(errors.filter((error) => !error.includes('__local-mesh-review__'))).toEqual([])
})

test('IKEA FADO를 음수 기둥 없는 구형 테이블 램프로 실측 렌더한다', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(String(error).slice(0, 300)))
  await page.goto('/')
  await page.waitForFunction(() => !!(window as any).__hp3d_store && !!(window as any).__hp3d_scene)
  await page.getByRole('button', { name: /조명/ }).click()
  const card = page.locator('.pcard', { hasText: /IKEA FADO 파도 탁상스탠드/ })
  await expect(card).toContainText('W250mm · D250mm · H240mm')
  await expect(card).toContainText('FADO 302.838.99')
  await expect(card).toContainText('24,900원')

  await page.evaluate(() => {
    window.__hp3d_store.setState({ placements: [] })
    window.__hp3d_store.getState().addPlacement('ik-fado-lamp', { x: 5600, z: 3600 })
  })
  await page.waitForFunction(() => {
    let found = false
    ;(window as any).__hp3d_scene.traverse((object: any) => {
      if (object.userData?.shapeKind === 'tableGlobeLamp') found = true
    })
    return found
  })
  const shape = await page.evaluate(() => {
    let result: any = null
    ;(window as any).__hp3d_scene.traverse((object: any) => {
      if (object.userData?.shapeKind !== 'tableGlobeLamp') return
      const sphere = object.children.find((child: any) => child.geometry?.type === 'SphereGeometry')
      const base = object.children.find((child: any) => child.geometry?.type === 'CylinderGeometry')
      result = {
        sphereScale: sphere.scale.toArray(),
        sphereCenterY: sphere.position.y,
        baseHeight: base.geometry.parameters.height,
        baseCenterY: base.position.y,
      }
    })
    return result
  })

  expect(shape.sphereScale[0]).toBe(125)
  expect(shape.sphereScale[2]).toBe(125)
  expect(shape.sphereCenterY + shape.sphereScale[1]).toBeCloseTo(240, 8)
  expect(shape.baseHeight).toBeGreaterThan(0)
  expect(shape.baseCenterY - shape.baseHeight / 2).toBeCloseTo(0, 8)
  await page.waitForFunction(
    () =>
      (window as any)
        .__hp3d_texture_stats?.()
        .loadedUrls.includes('/catalog/ikea/fado-table-lamp-white.jpg'),
    undefined,
    { timeout: 15_000 }
  )
  await expect(card.locator('[data-render-source="decal-fallback"]')).toBeVisible()
  expect(
    await page.evaluate(() => window.__hp3d_store.getState().productById('ik-fado-lamp').dims)
  ).toEqual({ w: 250, d: 250, h: 240 })
  await page.getByRole('button', { name: /가격/ }).click()
  await expect(page.locator('.cost-total b')).toHaveText('24,900원')
  expect(errors).toEqual([])
})

test('IKEA MALM을 매트리스 없는 현재 프레임 조합과 공식 가격으로 렌더한다', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(String(error).slice(0, 300)))
  await page.goto('/')
  await page.waitForFunction(() => !!(window as any).__hp3d_store && !!(window as any).__hp3d_scene)
  await page.getByRole('button', { name: /침실/ }).click()
  const card = page.locator('.pcard', { hasText: /IKEA MALM 말름 높은침대프레임/ })
  await expect(card).toContainText('MALM 890.052.64')
  await expect(card).toContainText('304,000원')
  await expect(card).toContainText('W166cm · D209cm · H100cm')

  await page.evaluate(() => {
    window.__hp3d_store.setState({ placements: [] })
    window.__hp3d_store.getState().addPlacement('ik-malm-queen', { x: 5600, z: 3600 })
  })
  await page.waitForFunction(() => {
    let found = false
    ;(window as any).__hp3d_scene.traverse((object: any) => {
      if (
        object.userData?.shapeKind === 'highBedFrame' &&
        object.userData?.includesMattress === false &&
        object.userData?.midbeamIncluded === true
      ) {
        found = true
      }
    })
    return found
  })
  const shape = await readBoxShape(page, 'highBedFrame')
  expect(shape).toMatchObject({
    includesMattress: false,
    includesSlattedBase: false,
    midbeamIncluded: true,
    meshCount: 5,
  })
  expect(shape.bounds).toEqual({
    minX: -830,
    maxX: 830,
    minY: 0,
    maxY: 1000,
    minZ: -1045,
    maxZ: 1045,
  })
  await expectRetailTexture(page, card, '/catalog/ikea/malm-bed-frame-high-white.jpg')
  await page.getByRole('button', { name: /가격/ }).click()
  await expect(page.locator('.cost-total b')).toHaveText('304,000원')
  expect(errors).toEqual([])
})

test('IKEA LACK을 하부선반이 있는 현재 단품과 공식 가격으로 렌더한다', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(String(error).slice(0, 300)))
  await page.goto('/')
  await page.waitForFunction(() => !!(window as any).__hp3d_store && !!(window as any).__hp3d_scene)
  await page.getByRole('button', { name: /거실/ }).click()
  const card = page.locator('.pcard', { hasText: /IKEA LACK 라크 커피테이블/ })
  await expect(card).toContainText('LACK 803.529.51')
  await expect(card).toContainText('59,900원')
  await expect(card).toContainText('W118cm · D780mm · H450mm')

  await page.evaluate(() => {
    window.__hp3d_store.setState({ placements: [] })
    window.__hp3d_store.getState().addPlacement('ik-lack-coffee', { x: 5600, z: 3600 })
  })
  await page.waitForFunction(() => {
    let found = false
    ;(window as any).__hp3d_scene.traverse((object: any) => {
      if (
        object.userData?.shapeKind === 'shelfCoffeeTable' &&
        object.userData?.shelfCount === 1 &&
        object.userData?.legCount === 4
      ) {
        found = true
      }
    })
    return found
  })
  const shape = await readBoxShape(page, 'shelfCoffeeTable')
  expect(shape).toMatchObject({ shelfCount: 1, legCount: 4, meshCount: 6 })
  expect(shape.bounds).toEqual({
    minX: -590,
    maxX: 590,
    minY: 0,
    maxY: 450,
    minZ: -390,
    maxZ: 390,
  })
  await expectRetailTexture(page, card, '/catalog/ikea/lack-coffee-table-black-brown.jpg')
  await page.getByRole('button', { name: /가격/ }).click()
  await expect(page.locator('.cost-total b')).toHaveText('59,900원')
  expect(errors).toEqual([])
})

test('IKEA BILLY를 현재 SKU·가격과 5개 선반의 열린 책장으로 렌더한다', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(String(error).slice(0, 300)))
  await page.goto('/')
  await page.waitForFunction(() => !!(window as any).__hp3d_store && !!(window as any).__hp3d_scene)
  await page.getByRole('button', { name: '🗄️ 수납' }).click()
  const card = page.locator('.pcard', { hasText: /IKEA BILLY 빌리 책장/ })
  await expect(card).toContainText('BILLY 005.220.47')
  await expect(card).toContainText('89,900원')
  await expect(card).toContainText('W800mm · D280mm · H202cm')

  await page.evaluate(() => {
    window.__hp3d_store.setState({ placements: [] })
    window.__hp3d_store.getState().addPlacement('ik-billy-bookcase', { x: 5600, z: 3600 })
  })
  await page.waitForFunction(() => {
    let found = false
    ;(window as any).__hp3d_scene.traverse((object: any) => {
      if (object.userData?.shapeKind === 'openBookcase') found = true
    })
    return found
  })
  const shape = await page.evaluate(() => {
    let result: any = null
    ;(window as any).__hp3d_scene.traverse((object: any) => {
      if (object.userData?.shapeKind !== 'openBookcase') return
      const meshes = object.children.filter((child: any) => child.geometry?.type === 'BoxGeometry')
      const bounds = meshes.reduce(
        (current: any, mesh: any) => {
          const { width, height, depth } = mesh.geometry.parameters
          current.minX = Math.min(current.minX, mesh.position.x - width / 2)
          current.maxX = Math.max(current.maxX, mesh.position.x + width / 2)
          current.minY = Math.min(current.minY, mesh.position.y - height / 2)
          current.maxY = Math.max(current.maxY, mesh.position.y + height / 2)
          current.minZ = Math.min(current.minZ, mesh.position.z - depth / 2)
          current.maxZ = Math.max(current.maxZ, mesh.position.z + depth / 2)
          return current
        },
        {
          minX: Number.POSITIVE_INFINITY,
          maxX: Number.NEGATIVE_INFINITY,
          minY: Number.POSITIVE_INFINITY,
          maxY: Number.NEGATIVE_INFINITY,
          minZ: Number.POSITIVE_INFINITY,
          maxZ: Number.NEGATIVE_INFINITY,
        }
      )
      result = {
        shelfCount: object.userData.shelfCount,
        meshCount: meshes.length,
        bounds,
      }
    })
    return result
  })

  expect(shape.shelfCount).toBe(5)
  expect(shape.meshCount).toBe(10)
  expect(shape.bounds).toEqual({
    minX: -400,
    maxX: 400,
    minY: 0,
    maxY: 2020,
    minZ: -140,
    maxZ: 140,
  })
  expect(
    await page.evaluate(() => window.__hp3d_store.getState().productById('ik-billy-bookcase').dims)
  ).toEqual({ w: 800, d: 280, h: 2020 })
  await expectRetailTexture(page, card, '/catalog/ikea/billy-bookcase-white.jpg')
  expect(errors).toEqual([])
})

test('IKEA NORDEN을 26/89/152cm 상태가 분리된 게이트레그 테이블로 렌더한다', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(String(error).slice(0, 300)))
  await page.goto('/')
  await page.waitForFunction(() => !!(window as any).__hp3d_store && !!(window as any).__hp3d_scene)
  await page.getByRole('button', { name: /거실/ }).click()
  const card = page.locator('.pcard', { hasText: /IKEA NORDEN 노르덴 게이트레그/ })
  await expect(card).toContainText('NORDEN 804.238.83')
  await expect(card).toContainText('399,000원')
  await expect(card).toContainText('W890mm · D800mm · H740mm')

  await page.evaluate(() => {
    window.__hp3d_store.setState({ placements: [] })
    window.__hp3d_store.getState().addPlacement('ik-norden-table', { x: 5600, z: 3600 })
  })
  await page.waitForFunction(() => {
    let found = false
    ;(window as any).__hp3d_scene.traverse((object: any) => {
      if (object.userData?.shapeKind === 'gatelegTable') found = true
    })
    return found
  })
  const inspector = page.locator('.inspector')
  const collapsedButton = inspector.getByRole('button', { name: '접힘 26cm' })
  const normalButton = inspector.getByRole('button', { name: '기본 89cm' })
  const expandedButton = inspector.getByRole('button', { name: '완전확장 152cm' })
  await expect(normalButton).toHaveClass(/on/)

  await collapsedButton.click()
  await expect(collapsedButton).toHaveClass(/on/)
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__hp3d_store
            .getState()
            .placements.find((placement) => placement.productId === 'ik-norden-table')?.dimsOverride
            ?.w
      )
    )
    .toBe(260)
  await page.waitForFunction(() => {
    let matched = false
    ;(window as any).__hp3d_scene.traverse((object: any) => {
      if (
        object.userData?.shapeKind === 'gatelegTable' &&
        object.userData?.openLeafCount === 0 &&
        object.userData?.foldedLeafCount === 2
      ) {
        matched = true
      }
    })
    return matched
  })

  await expandedButton.click()
  await expect(expandedButton).toHaveClass(/on/)
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__hp3d_store
            .getState()
            .placements.find((placement) => placement.productId === 'ik-norden-table')?.dimsOverride
            ?.w
      )
    )
    .toBe(1520)
  await page.waitForFunction(() => {
    let matched = false
    ;(window as any).__hp3d_scene.traverse((object: any) => {
      if (
        object.userData?.shapeKind === 'gatelegTable' &&
        object.userData?.openLeafCount === 2 &&
        object.userData?.foldedLeafCount === 0
      ) {
        matched = true
      }
    })
    return matched
  })

  await page.keyboard.press('Control+z')
  await expect(collapsedButton).toHaveClass(/on/)
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__hp3d_store
            .getState()
            .placements.find((placement) => placement.productId === 'ik-norden-table')?.dimsOverride
            ?.w
      )
    )
    .toBe(260)

  await normalButton.click()
  await expect(normalButton).toHaveClass(/on/)
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__hp3d_store
            .getState()
            .placements.find((placement) => placement.productId === 'ik-norden-table')?.dimsOverride
      )
    )
    .toBeUndefined()
  await page.waitForFunction(() => {
    let matched = false
    ;(window as any).__hp3d_scene.traverse((object: any) => {
      if (
        object.userData?.shapeKind === 'gatelegTable' &&
        object.userData?.normalLength === 890 &&
        object.userData?.openLeafCount === 1
      ) {
        matched = true
      }
    })
    return matched
  })
  const shape = await page.evaluate(() => {
    let result: any = null
    ;(window as any).__hp3d_scene.traverse((object: any) => {
      if (object.userData?.shapeKind !== 'gatelegTable') return
      const meshes = object.children.filter((child: any) => child.geometry?.type === 'BoxGeometry')
      const bounds = meshes.reduce(
        (current: any, mesh: any) => {
          const { width, height, depth } = mesh.geometry.parameters
          current.minX = Math.min(current.minX, mesh.position.x - width / 2)
          current.maxX = Math.max(current.maxX, mesh.position.x + width / 2)
          current.minY = Math.min(current.minY, mesh.position.y - height / 2)
          current.maxY = Math.max(current.maxY, mesh.position.y + height / 2)
          current.minZ = Math.min(current.minZ, mesh.position.z - depth / 2)
          current.maxZ = Math.max(current.maxZ, mesh.position.z + depth / 2)
          return current
        },
        {
          minX: Number.POSITIVE_INFINITY,
          maxX: Number.NEGATIVE_INFINITY,
          minY: Number.POSITIVE_INFINITY,
          maxY: Number.NEGATIVE_INFINITY,
          minZ: Number.POSITIVE_INFINITY,
          maxZ: Number.NEGATIVE_INFINITY,
        }
      )
      result = { ...object.userData, meshCount: meshes.length, bounds }
    })
    return result
  })

  expect(shape).toMatchObject({
    collapsedLength: 260,
    normalLength: 890,
    expandedLength: 1520,
    meshCount: 10,
  })
  expect(shape.bounds).toEqual({
    minX: -445,
    maxX: 445,
    minY: 0,
    maxY: 740,
    minZ: -400,
    maxZ: 400,
  })
  expect(
    await page.evaluate(() => window.__hp3d_store.getState().productById('ik-norden-table').dims)
  ).toEqual({ w: 890, d: 800, h: 740 })
  await expectRetailTexture(page, card, '/catalog/ikea/norden-gateleg-table-birch.jpg')
  expect(errors).toEqual([])
})

test('IKEA PAX/FORSAND를 공식 2프레임·4도어 구성과 가격으로 렌더한다', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(String(error).slice(0, 300)))
  await page.goto('/')
  await page.waitForFunction(() => !!(window as any).__hp3d_store && !!(window as any).__hp3d_scene)
  await page.getByRole('button', { name: '🗄️ 수납' }).click()

  const card = page.locator('.pcard', {
    hasText: /IKEA PAX 팍스.*FORSAND 포르산드/,
  })
  await expect(card).toContainText('PAX/FORSAND 495.010.34')
  await expect(card).toContainText('670,000원')
  await expect(card).toContainText('W200cm · D600mm · H201cm')

  await page.evaluate(() => {
    window.__hp3d_store.setState({ placements: [] })
    window.__hp3d_store.getState().addPlacement('ik-pax-wardrobe-200', { x: 5600, z: 3600 })
  })
  await page.waitForFunction(() => {
    let found = false
    ;(window as any).__hp3d_scene.traverse((object: any) => {
      if (
        object.userData?.shapeKind === 'modularWardrobe' &&
        object.userData?.frameCount === 2 &&
        object.userData?.doorCount === 4
      ) {
        found = true
      }
    })
    return found
  })

  const shape = await page.evaluate(() => {
    let result: any = null
    ;(window as any).__hp3d_scene.traverse((object: any) => {
      if (object.userData?.shapeKind !== 'modularWardrobe') return
      const meshes = object.children.filter((child: any) => child.geometry?.type === 'BoxGeometry')
      const bounds = meshes.reduce(
        (current: any, mesh: any) => {
          const { width, height, depth } = mesh.geometry.parameters
          current.minX = Math.min(current.minX, mesh.position.x - width / 2)
          current.maxX = Math.max(current.maxX, mesh.position.x + width / 2)
          current.minY = Math.min(current.minY, mesh.position.y - height / 2)
          current.maxY = Math.max(current.maxY, mesh.position.y + height / 2)
          current.minZ = Math.min(current.minZ, mesh.position.z - depth / 2)
          current.maxZ = Math.max(current.maxZ, mesh.position.z + depth / 2)
          return current
        },
        {
          minX: Number.POSITIVE_INFINITY,
          maxX: Number.NEGATIVE_INFINITY,
          minY: Number.POSITIVE_INFINITY,
          maxY: Number.NEGATIVE_INFINITY,
          minZ: Number.POSITIVE_INFINITY,
          maxZ: Number.NEGATIVE_INFINITY,
        }
      )
      result = { ...object.userData, meshCount: meshes.length, bounds }
    })
    return result
  })

  expect(shape).toMatchObject({
    frameCount: 2,
    doorCount: 4,
    handlesIncluded: false,
    meshCount: 7,
  })
  expect(shape.bounds).toEqual({
    minX: -1000,
    maxX: 1000,
    minY: 0,
    maxY: 2012,
    minZ: -300,
    maxZ: 300,
  })
  expect(
    await page.evaluate(() => {
      const product = window.__hp3d_store.getState().productById('ik-pax-wardrobe-200')
      return { dims: product.dims, snapToWall: product.snapToWall }
    })
  ).toEqual({ dims: { w: 2000, d: 600, h: 2012 }, snapToWall: true })

  await expectRetailTexture(page, card, '/catalog/ikea/pax-forsand-wardrobe-white-white.jpg')
  await page.getByRole('button', { name: /가격/ }).click()
  await expect(page.locator('.cost-total b')).toHaveText('670,000원')
  expect(errors).toEqual([])
})
