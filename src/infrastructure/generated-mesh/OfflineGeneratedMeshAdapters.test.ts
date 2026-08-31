import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { QuarantinedGeneratedMesh } from '../../application/generatedMeshLifecycle'
import {
  FileGeneratedMeshQuarantine,
  FileProductImageAssetSource,
} from './OfflineGeneratedMeshAdapters'

const roots: string[] = []

afterEach(async () => {
  for (const root of roots.splice(0)) {
    if (!path.resolve(root).startsWith(path.resolve(os.tmpdir())))
      throw new Error('unsafe-test-cleanup')
    await rm(root, { recursive: true, force: true })
  }
})

describe('오프라인 생성 메시 파일 어댑터', () => {
  it('allowlist 내부 공식 이미지 bytes와 실제 SHA-256만 읽는다', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'hp3d-mesh-source-'))
    roots.push(root)
    await mkdir(path.join(root, 'catalog'), { recursive: true })
    const bytes = new Uint8Array([1, 2, 3])
    await writeFile(path.join(root, 'catalog', 'source.png'), bytes)
    const source = new FileProductImageAssetSource(root)

    await expect(
      source.read({
        textureUrl: '/catalog/source.png',
        imageSourceUrl: 'https://example.com/source.png',
        sha256: 'manifest-does-not-control-result',
        projection: 'front',
      })
    ).resolves.toEqual({
      bytes,
      mimeType: 'image/png',
      sha256: createHash('sha256').update(bytes).digest('hex'),
    })
  })

  it('실제 bytes hash가 일치할 때만 public 밖 quarantine에 원자 기록한다', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'hp3d-mesh-quarantine-'))
    roots.push(root)
    const glb = new Uint8Array([4, 5, 6])
    const hash = createHash('sha256').update(glb).digest('hex')
    const reviewPng = new Uint8Array([7])
    const reviewSha256 = createHash('sha256').update(reviewPng).digest('hex')
    const asset: QuarantinedGeneratedMesh = {
      quarantineId: 'job-1',
      productId: 'product-1',
      productFingerprint: 'product-mesh-v1|fixture',
      sourceImageSha256: 'b'.repeat(64),
      contentSha256: hash,
      byteLength: glb.byteLength,
      generatedAt: '2026-08-28T00:00:00.000Z',
      generator: { name: 'fixture', version: '1', modelDigest: 'c'.repeat(64) },
      inspection: { bounds: { w: 1, d: 1, h: 1 }, triangles: 1, silhouetteIou: 0.8 },
      reviewViews: [{ name: 'view-000.png', sha256: reviewSha256, byteLength: 1 }],
    }
    const quarantine = new FileGeneratedMeshQuarantine(root)

    const record = await quarantine.save(asset, glb, [
      { name: 'view-000.png', png: reviewPng, sha256: reviewSha256 },
    ])
    expect(record).toBe('product-1/job-1/record.json')
    expect(JSON.parse(await readFile(path.join(root, record), 'utf8'))).toMatchObject({
      status: 'review-pending',
      binary: 'mesh.glb',
      asset: { contentSha256: hash },
    })
    expect(
      Uint8Array.from(await readFile(path.join(root, 'product-1', 'job-1', 'view-000.png')))
    ).toEqual(reviewPng)
    await expect(
      quarantine.save({ ...asset, contentSha256: 'd'.repeat(64) }, glb, [])
    ).rejects.toThrow('quarantine-content-mismatch')
  })
})
