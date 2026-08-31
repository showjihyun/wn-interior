// 프로덕션 빌드 스모크 — 로드/렌더/배치/2D 전환만 빠르게
import { test, expect, type Page } from '@playwright/test'
import { createGeneratedMeshE2EFixture } from '../scripts/generated-mesh-fixture'

const worldPoint = async (page: Page, x: number, z: number) =>
  page.evaluate(
    ({ x, z }) => {
      const camera = (window as any).__hp3d_cam
      const rect = document.querySelector('.viewport canvas')!.getBoundingClientRect()
      const projected = camera.position.clone().set(x, 0, z).project(camera)
      return {
        x: rect.x + ((projected.x + 1) / 2) * rect.width,
        y: rect.y + ((1 - projected.y) / 2) * rect.height,
      }
    },
    { x, z }
  )

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear())
})

test('프로덕션 빌드: 앱 로드 + 3D 캔버스 + 스토어 초기화', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(String(error).slice(0, 300)))
  await page.goto('/')
  await page.waitForFunction(() => !!(window as any).__hp3d_store)
  await expect(page.locator('.viewport canvas')).toBeVisible()
  const n = await page.evaluate(() => window.__hp3d_store.getState().placements.length)
  expect(n).toBeGreaterThan(0)

  // 기존 3D 출력의 특성화 검사: canvas 존재가 아니라 실제 WebGL 픽셀 다양성을 확인한다.
  await page.waitForFunction(() => !!(window as any).__hp3d_gl)
  await page.waitForTimeout(500)
  const pixels = await page.evaluate(() => {
    const renderer = (window as any).__hp3d_gl
    const gl = renderer.getContext()
    const width = renderer.domElement.width
    const height = renderer.domElement.height
    const rgba = new Uint8Array(width * height * 4)
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, rgba)

    let opaque = 0
    const quantizedColors = new Set<number>()
    for (let index = 0; index < rgba.length; index += 16) {
      if (rgba[index + 3] > 0) opaque++
      quantizedColors.add(
        ((rgba[index] >> 4) << 8) | ((rgba[index + 1] >> 4) << 4) | (rgba[index + 2] >> 4)
      )
    }
    return { opaque, samples: rgba.length / 16, colors: quantizedColors.size }
  })
  expect(pixels.opaque).toBeGreaterThan(pixels.samples * 0.5)
  expect(pixels.colors).toBeGreaterThan(8)
  expect(errors).toEqual([])
})

test('프로덕션 빌드: 제품 배치 → 선택 → 2D 전환', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)))
  await page.goto('/')
  await page.waitForFunction(() => !!(window as any).__hp3d_store)
  await page.waitForTimeout(600)
  await page.evaluate(() => window.__hp3d_store.setState({ placements: [] }))
  await page.getByRole('button', { name: '탑뷰' }).click()
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: /거실/ }).click()
  await page.getByText('3인용 패브릭 소파').first().click()
  const point = await worldPoint(page, 9000, 5000)
  await page.mouse.move(point.x, point.y)
  await page.waitForTimeout(250)
  await page.mouse.click(point.x, point.y)
  expect(
    await page.evaluate(() => window.__hp3d_store.getState().placements.at(-1)?.productId)
  ).toBe('p-sofa3')
  await page.getByRole('button', { name: '2D 도면편집' }).click()
  await expect(page.locator('.ed2d-svg')).toBeVisible()
  expect(errors).toEqual([])
})

test('프로덕션 빌드: 비상업 도면 모델은 기본 비활성 상태를 명확히 알린다', async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => !!(window as any).__hp3d_store)
  await page.getByRole('button', { name: /평면도 업로드.*3D/ }).click()
  const modal = page.locator('.modal')
  await expect(modal.getByText(/상업 배포 안전 모드/)).toBeVisible()
  await expect(modal.getByText(/비상업 CNN.*비활성/)).toBeVisible()
})

test('프로덕션 빌드: IKEA 실상품 이미지와 3D 텍스처 자산을 제공한다', async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => !!(window as any).__hp3d_store)
  await page.getByRole('button', { name: /거실/ }).click()
  const card = page.locator('.pcard', { hasText: /KIVIK 쉬비크 3인용소파/ })
  await expect(card.getByText('공식 사진 기반 3D')).toBeVisible()
  await expect(card.locator('[data-visual-capability="decal"]')).toBeVisible()
  await expect(card.getByText(/로컬 생성 3D/)).toHaveCount(0)
  const image = card.locator('img.retail-thumb')
  await expect(image).toBeVisible()
  await expect
    .poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth))
    .toBeGreaterThan(0)

  await page.evaluate(() => {
    window.__hp3d_store.setState({ placements: [] })
    window.__hp3d_store.getState().addPlacement('ik-kivik-3seat', { x: 9000, z: 5000 })
  })
  await page.waitForFunction(
    () =>
      (window as any).__hp3d_texture_stats?.().loadedUrls.includes('/catalog/ikea/kivik-3seat.jpg'),
    undefined,
    { timeout: 15_000 }
  )
  await page.waitForFunction(() => {
    let found = false
    ;(window as any).__hp3d_scene.traverse((object: any) => {
      if (
        object.userData?.shapeKind === 'kivikSofa' &&
        object.userData?.seatCushionCount === 2 &&
        object.userData?.seatWidth === 1800
      ) {
        found = true
      }
    })
    return found
  })
  const projection = await page.evaluate(() => {
    let result: any = null
    ;(window as any).__hp3d_scene.traverse((object: any) => {
      const material = object.material
      const map = Array.isArray(material)
        ? material.find((candidate: any) => candidate.map)?.map
        : material?.map
      if (!result && map?.userData?.sourceUrl?.includes('kivik-3-seat-sofa-gunnared-blue')) {
        result = {
          planeWidth: object.geometry.parameters.width,
          planeHeight: object.geometry.parameters.height,
          imageWidth: map.image.width,
          imageHeight: map.image.height,
        }
      }
    })
    return result
  })
  expect(projection).not.toBeNull()
  expect(projection.planeWidth / projection.planeHeight).toBeCloseTo(
    projection.imageWidth / projection.imageHeight,
    8
  )
  expect(projection.imageWidth).toBeLessThan(1400)
  expect(projection.imageHeight).toBeLessThan(1400)
})

test('프로덕션 빌드: IKEA FADO를 구형 테이블 램프로 렌더한다', async ({ page }) => {
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
  await page.waitForFunction(
    () =>
      (window as any)
        .__hp3d_texture_stats?.()
        .loadedUrls.includes('/catalog/ikea/fado-table-lamp-white.jpg'),
    undefined,
    { timeout: 15_000 }
  )
  await expect(card.locator('[data-render-source="decal-fallback"]')).toBeVisible()
  expect(await page.evaluate(() => (window as any).__hp3d_gl.getContext().isContextLost())).toBe(
    false
  )
})

test('프로덕션 빌드: IKEA MALM을 매트리스 없는 높은침대프레임으로 렌더한다', async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => !!(window as any).__hp3d_store && !!(window as any).__hp3d_scene)
  await page.getByRole('button', { name: /침실/ }).click()
  const card = page.locator('.pcard', { hasText: /IKEA MALM 말름 높은침대프레임/ })
  await expect(card).toContainText('MALM 890.052.64')
  await expect(card).toContainText('304,000원')
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
  await page.waitForFunction(
    () =>
      (window as any)
        .__hp3d_texture_stats?.()
        .loadedUrls.includes('/catalog/ikea/malm-bed-frame-high-white.jpg'),
    undefined,
    { timeout: 15_000 }
  )
  expect(await page.evaluate(() => (window as any).__hp3d_gl.getContext().isContextLost())).toBe(
    false
  )
})

test('프로덕션 빌드: IKEA LACK을 하부선반 커피테이블로 렌더한다', async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => !!(window as any).__hp3d_store && !!(window as any).__hp3d_scene)
  await page.getByRole('button', { name: /거실/ }).click()
  const card = page.locator('.pcard', { hasText: /IKEA LACK 라크 커피테이블/ })
  await expect(card).toContainText('LACK 803.529.51')
  await expect(card).toContainText('59,900원')
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
  await page.waitForFunction(
    () =>
      (window as any)
        .__hp3d_texture_stats?.()
        .loadedUrls.includes('/catalog/ikea/lack-coffee-table-black-brown.jpg'),
    undefined,
    { timeout: 15_000 }
  )
  expect(await page.evaluate(() => (window as any).__hp3d_gl.getContext().isContextLost())).toBe(
    false
  )
})

test('프로덕션 빌드: IKEA BILLY를 현재 SKU의 열린 책장으로 렌더한다', async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => !!(window as any).__hp3d_store && !!(window as any).__hp3d_scene)
  await page.getByRole('button', { name: '🗄️ 수납' }).click()
  const card = page.locator('.pcard', { hasText: /IKEA BILLY 빌리 책장/ })
  await expect(card).toContainText('BILLY 005.220.47')
  await expect(card).toContainText('89,900원')
  await page.evaluate(() => {
    window.__hp3d_store.setState({ placements: [] })
    window.__hp3d_store.getState().addPlacement('ik-billy-bookcase', { x: 5600, z: 3600 })
  })
  await page.waitForFunction(() => {
    let found = false
    ;(window as any).__hp3d_scene.traverse((object: any) => {
      if (object.userData?.shapeKind === 'openBookcase' && object.userData?.shelfCount === 5) {
        found = true
      }
    })
    return found
  })
  await page.waitForFunction(
    () =>
      (window as any)
        .__hp3d_texture_stats?.()
        .loadedUrls.includes('/catalog/ikea/billy-bookcase-white.jpg'),
    undefined,
    { timeout: 15_000 }
  )
  await expect(card.locator('[data-render-source="decal-fallback"]')).toBeVisible()
  expect(await page.evaluate(() => (window as any).__hp3d_gl.getContext().isContextLost())).toBe(
    false
  )
})

test('프로덕션 빌드: IKEA NORDEN을 890mm 게이트레그 기본 상태로 렌더한다', async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => !!(window as any).__hp3d_store && !!(window as any).__hp3d_scene)
  await page.getByRole('button', { name: /거실/ }).click()
  const card = page.locator('.pcard', { hasText: /IKEA NORDEN 노르덴 게이트레그/ })
  await expect(card).toContainText('NORDEN 804.238.83')
  await expect(card).toContainText('399,000원')
  await page.evaluate(() => {
    window.__hp3d_store.setState({ placements: [] })
    window.__hp3d_store.getState().addPlacement('ik-norden-table', { x: 5600, z: 3600 })
  })
  await page.waitForFunction(() => {
    let found = false
    ;(window as any).__hp3d_scene.traverse((object: any) => {
      if (object.userData?.shapeKind === 'gatelegTable' && object.userData?.normalLength === 890) {
        found = true
      }
    })
    return found
  })
  const inspector = page.locator('.inspector')
  await inspector.getByRole('button', { name: '완전확장 152cm' }).click()
  await expect(inspector.locator('.dims-input').first()).toHaveValue('1520')
  await page.waitForFunction(() => {
    let found = false
    ;(window as any).__hp3d_scene.traverse((object: any) => {
      if (object.userData?.shapeKind === 'gatelegTable' && object.userData?.openLeafCount === 2) {
        found = true
      }
    })
    return found
  })
  await page.waitForFunction(
    () =>
      (window as any)
        .__hp3d_texture_stats?.()
        .loadedUrls.includes('/catalog/ikea/norden-gateleg-table-birch.jpg'),
    undefined,
    { timeout: 15_000 }
  )
  await expect(card.locator('[data-render-source="decal-fallback"]')).toBeVisible()
  expect(await page.evaluate(() => (window as any).__hp3d_gl.getContext().isContextLost())).toBe(
    false
  )
})

test('프로덕션 빌드: IKEA PAX/FORSAND를 2프레임·4도어로 렌더한다', async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => !!(window as any).__hp3d_store && !!(window as any).__hp3d_scene)
  await page.getByRole('button', { name: '🗄️ 수납' }).click()
  const card = page.locator('.pcard', {
    hasText: /IKEA PAX 팍스.*FORSAND 포르산드/,
  })
  await expect(card).toContainText('PAX/FORSAND 495.010.34')
  await expect(card).toContainText('670,000원')
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
        object.userData?.doorCount === 4 &&
        object.userData?.handlesIncluded === false
      ) {
        found = true
      }
    })
    return found
  })
  await page.waitForFunction(
    () =>
      (window as any)
        .__hp3d_texture_stats?.()
        .loadedUrls.includes('/catalog/ikea/pax-forsand-wardrobe-white-white.jpg'),
    undefined,
    { timeout: 15_000 }
  )
  await expect(card.locator('[data-render-source="decal-fallback"]')).toBeVisible()
  expect(await page.evaluate(() => (window as any).__hp3d_gl.getContext().isContextLost())).toBe(
    false
  )
})

test('프로덕션 빌드: test-mode 공개 GLB를 실제 loader로 렌더한다', async ({ page }) => {
  const fixture = createGeneratedMeshE2EFixture()
  const asset = fixture.manifest.assets[0]
  await page.route(`**${asset.uri}`, (route) =>
    route.fulfill({ status: 200, contentType: 'model/gltf-binary', body: Buffer.from(fixture.glb) })
  )
  await page.route(`**${fixture.product.appearance!.textureUrl}`, (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from(fixture.fallbackPng) })
  )
  await page.goto('/')
  await page.waitForFunction(() => !!(window as any).__hp3d_store)
  await page.getByRole('button', { name: /거실/ }).click()
  const card = page.locator('.pcard', { hasText: fixture.product.name })
  await expect(card.getByText(/AI 생성 3D/)).toBeVisible()

  await page.evaluate((productId) => {
    window.__hp3d_store.setState({ placements: [] })
    window.__hp3d_store.getState().addPlacement(productId, { x: 5600, z: 3600 })
  }, fixture.product.id)
  await page.waitForFunction((assetId) => {
    const scene = (window as any).__hp3d_scene
    if (!scene) return false
    let found = false
    scene.traverse((object: any) => {
      if (object.userData?.assetId === assetId) found = true
    })
    return found
  }, asset.assetId)
  await expect(card.locator('[data-render-source="approved-mesh"]')).toBeVisible()
})

for (const failure of ['404', 'corrupt'] as const) {
  test(`프로덕션 빌드: 생성 GLB ${failure}는 공식 이미지로 복구한다`, async ({ page }) => {
    const { fixture, card, errors } = await openGeneratedMeshFixture(page, failure, true)

    await expect(card.locator('[data-render-source="decal-fallback"]')).toBeVisible()
    await page.waitForFunction(
      (textureUrl) => (window as any).__hp3d_texture_stats?.().loadedUrls.includes(textureUrl),
      fixture.product.appearance!.textureUrl
    )
    expect(await page.evaluate(() => (window as any).__hp3d_gl.getContext().isContextLost())).toBe(
      false
    )
    expect(errors).toEqual([])
  })
}

test('프로덕션 빌드: 생성 GLB와 이미지가 모두 실패해도 실측 기본 형상을 유지한다', async ({
  page,
}) => {
  const { card, errors } = await openGeneratedMeshFixture(page, '404', false)

  await expect(card.locator('[data-render-source="parametric-fallback"]')).toBeVisible()
  await expect(page.locator('.viewport canvas')).toBeVisible()
  expect(await page.evaluate(() => (window as any).__hp3d_gl.getContext().isContextLost())).toBe(
    false
  )
  expect(errors).toEqual([])
})

async function openGeneratedMeshFixture(
  page: Page,
  glb: '404' | 'corrupt',
  imageSucceeds: boolean
) {
  const fixture = createGeneratedMeshE2EFixture()
  const asset = fixture.manifest.assets[0]
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(String(error).slice(0, 300)))
  await page.route(`**${asset.uri}`, (route) =>
    glb === '404'
      ? route.fulfill({ status: 404, body: 'not found' })
      : route.fulfill({
          status: 200,
          contentType: 'model/gltf-binary',
          body: Buffer.from([1, 2, 3, 4]),
        })
  )
  await page.route(`**${fixture.product.appearance!.textureUrl}`, (route) =>
    imageSucceeds
      ? route.fulfill({
          status: 200,
          contentType: 'image/png',
          body: Buffer.from(fixture.fallbackPng),
        })
      : route.fulfill({ status: 404, body: 'not found' })
  )
  await page.goto('/')
  await page.waitForFunction(() => !!(window as any).__hp3d_store)
  await page.getByRole('button', { name: /거실/ }).click()
  const card = page.locator('.pcard', { hasText: fixture.product.name })
  await expect(card).toBeVisible()
  await page.evaluate((productId) => {
    window.__hp3d_store.setState({ placements: [] })
    window.__hp3d_store.getState().addPlacement(productId, { x: 5600, z: 3600 })
  }, fixture.product.id)
  return { fixture, card, errors }
}
