import type { ApprovedProductMeshCatalog, ProductCatalog } from '../../application/ports'
import type { ApprovedProductMesh } from '../../application/productMeshApproval'
import { buildProductMeshFingerprint } from '../../application/generatedMeshLifecycle'
import publishedManifest from './published-manifest.v2.json'

interface PublishedMeshManifest {
  schemaVersion: 2
  assets: ApprovedProductMesh[]
}

export class StaticApprovedMeshCatalog implements ApprovedProductMeshCatalog {
  private readonly assets: ApprovedProductMesh[] = []

  constructor(products: ProductCatalog, manifest: unknown = publishedManifest) {
    const decoded = decodeManifest(manifest)
    if (!decoded) {
      console.warn('[published-mesh] manifest 스키마가 유효하지 않아 모든 메시를 제외합니다.')
      return
    }

    for (const raw of decoded.assets) {
      const asset = decodePublishedAsset(raw)
      if (!asset) {
        console.warn('[published-mesh] 공개 manifest에 허용되지 않은 필드나 값이 있습니다.')
        continue
      }
      const product = products.findById(asset.productId)
      if (!product) {
        console.warn(`[published-mesh] 제품을 찾을 수 없어 제외합니다: ${asset.productId}`)
        continue
      }
      if (asset.productFingerprint !== buildProductMeshFingerprint(product)) {
        console.warn(`[published-mesh] 현재 제품 fingerprint와 달라 제외합니다: ${asset.productId}`)
        continue
      }
      if (this.assets.some((entry) => entry.productId === asset.productId)) {
        console.warn(`[published-mesh] 중복 제품 자산을 제외합니다: ${asset.productId}`)
        continue
      }
      this.assets.push(Object.freeze({ ...asset }))
    }
  }

  findForProduct(productId: string, productFingerprint: string): ApprovedProductMesh | undefined {
    return this.assets.find(
      (asset) => asset.productId === productId && asset.productFingerprint === productFingerprint
    )
  }

  list(): readonly ApprovedProductMesh[] {
    return this.assets
  }
}

function decodeManifest(value: unknown): PublishedMeshManifest | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<PublishedMeshManifest>
  if (candidate.schemaVersion !== 2 || !Array.isArray(candidate.assets)) return null
  return candidate as PublishedMeshManifest
}

const PUBLISHED_KEYS = [
  'assetId',
  'byteLength',
  'generatorLabel',
  'productFingerprint',
  'productId',
  'publishedAt',
  'sha256',
  'uri',
  'visualOnly',
].sort()

function decodePublishedAsset(value: unknown): ApprovedProductMesh | null {
  if (!value || typeof value !== 'object') return null
  const keys = Object.keys(value).sort()
  if (
    keys.length !== PUBLISHED_KEYS.length ||
    keys.some((key, index) => key !== PUBLISHED_KEYS[index])
  ) {
    return null
  }
  const asset = value as Partial<ApprovedProductMesh>
  if (
    !asset.assetId ||
    !asset.productId ||
    !asset.productFingerprint?.startsWith('product-mesh-v1|') ||
    !/^[a-f0-9]{64}$/.test(asset.sha256 ?? '') ||
    asset.uri !== `/catalog/generated/${asset.sha256}.glb` ||
    !Number.isInteger(asset.byteLength) ||
    !(asset.byteLength! > 0) ||
    asset.visualOnly !== true ||
    !asset.generatorLabel ||
    !/^\d{4}-\d{2}-\d{2}T/.test(asset.publishedAt ?? '')
  ) {
    return null
  }
  return asset as ApprovedProductMesh
}
