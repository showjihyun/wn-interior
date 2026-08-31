import { expect, test } from '@playwright/test'
import sharp from 'sharp'

test('IKEA 실상품 이미지·가격 기준을 표시하고 3D 텍스처로 로드한다', async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => !!(window as any).__hp3d_store)

  await page.getByRole('button', { name: /거실/ }).click()
  const card = page.locator('.pcard', {
    hasText: 'KIVIK 쉬비크 3인용소파 군나레드 블루',
  })
  await expect(card).toBeVisible()
  await expect(card.locator('img.retail-thumb')).toHaveAttribute(
    'src',
    '/catalog/ikea/kivik-3seat.jpg'
  )
  await expect(card).toContainText('699,000원')
  await expect(card).toContainText('3인용소파프레임+군나레드 커버 조합 1세트')
  await expect(card).toContainText('2026-08-28 확인')
  const visualCapability = card.locator('[data-visual-capability]')
  await expect(visualCapability).toBeVisible()
  const capability = await visualCapability.getAttribute('data-visual-capability')
  if (capability === 'local-review-mesh') {
    await expect(card.getByText('로컬 생성 3D · 자동 게이트 실패')).toBeVisible()
  } else {
    await expect(card.getByText('공식 사진 기반 3D')).toHaveAttribute(
      'data-visual-capability',
      'decal'
    )
  }

  await page.evaluate(() => {
    window.__hp3d_store.setState({ placements: [] })
    window.__hp3d_store.getState().addPlacement('ik-kivik-3seat', { x: 9000, z: 5000 })
    window.__hp3d_store.getState().setMode('3d')
  })
  if (capability === 'local-review-mesh') {
    await page.waitForFunction(() => {
      let found = false
      ;(window as any).__hp3d_scene?.traverse((object: any) => {
        if (object.userData?.localReview === true) found = true
      })
      return found
    })
  } else {
    await page.waitForFunction(
      () =>
        (window as any)
          .__hp3d_texture_stats?.()
          .loadedUrls.includes('/catalog/ikea/kivik-3seat.jpg'),
      undefined,
      { timeout: 15_000 }
    )
  }

  const canvas = page.locator('.viewport canvas')
  await expect(canvas).toBeVisible()
  const screenshot = await canvas.screenshot()
  const { data } = await sharp(screenshot).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  let darkProductPixels = 0
  for (let index = 0; index < data.length; index += 3) {
    const red = data[index]
    const green = data[index + 1]
    const blue = data[index + 2]
    if (red < 155 && green > red + 4 && blue > red + 14) darkProductPixels += 1
  }
  expect(darkProductPixels).toBeGreaterThan(150)
})

test('공식 사진 투영면은 상품군과 관계없이 원본 crop 비율을 보존한다', async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => !!(window as any).__hp3d_store && !!(window as any).__hp3d_scene)
  const productIds = [
    'ik-tillreda-induction-2zone',
    'ik-aelmaren-kitchen-faucet',
    'ik-kilsviken-sink-72',
    'ik-metod-sinarp-sink-cabinet',
    'ik-majgull-curtain-pair',
  ]

  for (const productId of productIds) {
    const expected = await page.evaluate((id) => {
      const state = window.__hp3d_store.getState()
      const product = state.productById(id)
      window.__hp3d_store.setState({ placements: [] })
      if (id === 'ik-aelmaren-kitchen-faucet') {
        state.addPlacement('ik-metod-sinarp-sink-cabinet', { x: 9000, z: 5000 })
        state.addPlacement('ik-kilsviken-sink-72', { x: 9000, z: 5000 })
      } else if (id === 'ik-kilsviken-sink-72') {
        state.addPlacement('ik-metod-sinarp-sink-cabinet', { x: 9000, z: 5000 })
      }
      state.addPlacement(id, { x: 9000, z: 5000 })
      const appearance = product.appearance
      if (!appearance) throw new Error(`retail-appearance-missing:${id}`)
      return {
        sourceUrl: appearance.imageSourceUrl,
        maxWidth: product.dims.w * (appearance.projection === 'cutout' ? 1.04 : 0.98),
        maxHeight:
          appearance.projection === 'top'
            ? product.dims.d * 0.98
            : product.dims.h * (appearance.projection === 'curtain' ? 0.96 : 1.02),
      }
    }, productId)
    await expect
      .poll(() =>
        page.evaluate((sourceUrl) => {
          let result: null | {
            planeWidth: number
            planeHeight: number
            imageWidth: number
            imageHeight: number
          } = null
          ;(window as any).__hp3d_scene.traverse((object: any) => {
            const material = object.material
            const map = Array.isArray(material)
              ? material.find((candidate: any) => candidate.map)?.map
              : material?.map
            if (!result && map?.userData?.sourceUrl === sourceUrl) {
              result = {
                planeWidth: object.geometry.parameters.width,
                planeHeight: object.geometry.parameters.height,
                imageWidth: map.image.width,
                imageHeight: map.image.height,
              }
            }
          })
          return result
        }, expected.sourceUrl)
      )
      .not.toBeNull()

    const measured = await page.evaluate((sourceUrl) => {
      let result: any = null
      ;(window as any).__hp3d_scene.traverse((object: any) => {
        const material = object.material
        const map = Array.isArray(material)
          ? material.find((candidate: any) => candidate.map)?.map
          : material?.map
        if (!result && map?.userData?.sourceUrl === sourceUrl) {
          result = {
            planeWidth: object.geometry.parameters.width,
            planeHeight: object.geometry.parameters.height,
            imageWidth: map.image.width,
            imageHeight: map.image.height,
          }
        }
      })
      return result
    }, expected.sourceUrl)
    expect(measured.planeWidth / measured.planeHeight).toBeCloseTo(
      measured.imageWidth / measured.imageHeight,
      8
    )
    expect(measured.planeWidth).toBeLessThanOrEqual(expected.maxWidth + 1e-6)
    expect(measured.planeHeight).toBeLessThanOrEqual(expected.maxHeight + 1e-6)
  }
})
