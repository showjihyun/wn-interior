import {
  Component,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  type ErrorInfo,
  type ReactNode,
} from 'react'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import type { Product } from '../../domain/model'
import type { ProductVisualDecision } from '../../application/productVisual'
import { useAppRuntime } from '../AppRuntimeContext'
import { ProductImageDecal } from '../texture/ProductImageDecal'
import { Shape } from './shapes'
import {
  calculateContainedMeshTransform,
  calculateExactEnvelopeMeshTransform,
} from './generatedMeshFit'

export class MeshLoadErrorBoundary extends Component<
  {
    resetKey: string
    fallback: ReactNode
    children: ReactNode
    onError?: (error: Error, info: ErrorInfo) => void
  },
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.props.onError?.(error, info)
  }

  componentDidUpdate(previous: Readonly<{ resetKey: string }>): void {
    if (previous.resetKey !== this.props.resetKey && this.state.failed) {
      this.setState({ failed: false })
    }
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

export function ProductVisual({ product, color }: { product: Product; color?: string }) {
  const { productVisuals, productVisualStatus } = useAppRuntime()
  const decision = productVisuals.resolve(product)
  const fallbackStatus = product.appearance ? 'decal-fallback' : 'parametric-fallback'
  const handleTextureError = useCallback(
    () => productVisualStatus.set(product.id, 'parametric-fallback'),
    [product.id, productVisualStatus]
  )
  const fallback = (
    <ParametricProductVisual product={product} color={color} onTextureError={handleTextureError} />
  )

  useEffect(() => {
    productVisualStatus.set(
      product.id,
      decision.kind === 'approved-mesh'
        ? 'mesh-loading'
        : decision.kind === 'local-review-mesh'
          ? 'local-review-loading'
          : decision.kind === 'user-model'
            ? 'user-model-loading'
            : fallbackStatus
    )
  }, [decision.kind, fallbackStatus, product.id, productVisualStatus])

  if (
    decision.kind !== 'approved-mesh' &&
    decision.kind !== 'local-review-mesh' &&
    decision.kind !== 'user-model'
  ) {
    return fallback
  }
  const url = decision.kind === 'user-model' ? decision.url : decision.asset.uri
  return (
    <MeshLoadErrorBoundary
      resetKey={url}
      fallback={fallback}
      onError={() => productVisualStatus.set(product.id, fallbackStatus)}
    >
      <Suspense fallback={fallback}>
        <FittedGltfProduct
          url={url}
          dims={product.dims}
          decision={decision}
          onReady={() =>
            productVisualStatus.set(
              product.id,
              decision.kind === 'approved-mesh'
                ? 'approved-mesh'
                : decision.kind === 'local-review-mesh'
                  ? 'local-review-mesh'
                  : 'user-model'
            )
          }
        />
      </Suspense>
    </MeshLoadErrorBoundary>
  )
}

function ParametricProductVisual({
  product,
  color,
  onTextureError,
}: {
  product: Product
  color?: string
  onTextureError?: (error: unknown) => void
}) {
  return (
    <>
      <Shape kind={product.shape} p={product} c={color} />
      <ProductImageDecal product={product} onError={onTextureError} />
    </>
  )
}

export function FittedGltfProduct({
  url,
  dims,
  decision,
  onReady,
}: {
  url: string
  dims: Product['dims']
  decision: Extract<
    ProductVisualDecision,
    { kind: 'approved-mesh' | 'local-review-mesh' | 'user-model' }
  >
  onReady?: () => void
}) {
  const { scene } = useGLTF(url)
  const { w, d, h } = dims
  const visualSource = decision.kind
  const assetId = decision.kind === 'user-model' ? undefined : decision.asset.assetId
  const assetSha256 = decision.kind === 'user-model' ? undefined : decision.asset.sha256
  const prepared = useMemo(() => {
    const clone = scene.clone(true)
    clone.traverse((object) => {
      if ((object as THREE.Mesh).isMesh) {
        object.castShadow = true
        object.receiveShadow = true
      }
    })
    const bounds = new THREE.Box3().setFromObject(clone)
    const meshBounds = {
      min: { x: bounds.min.x, y: bounds.min.y, z: bounds.min.z },
      max: { x: bounds.max.x, y: bounds.max.y, z: bounds.max.z },
    }
    const transform =
      visualSource === 'approved-mesh' || visualSource === 'local-review-mesh'
        ? calculateExactEnvelopeMeshTransform(meshBounds, { w, d, h })
        : calculateContainedMeshTransform(meshBounds, { w, d, h })
    if (!transform) throw new Error(`product-mesh-invalid-bounds:${url}`)
    if (typeof transform.scale === 'number') clone.scale.setScalar(transform.scale)
    else clone.scale.set(transform.scale.x, transform.scale.y, transform.scale.z)
    clone.position.set(transform.position.x, transform.position.y, transform.position.z)
    clone.userData.visualSource = visualSource
    clone.userData.visualOnly = true
    clone.userData.localReview = visualSource === 'local-review-mesh'
    if ('axisStretchRatio' in transform) {
      clone.userData.axisStretchRatio = transform.axisStretchRatio
    }
    if (assetId && assetSha256) {
      clone.userData.assetId = assetId
      clone.userData.sha256 = assetSha256
    }
    return clone
  }, [assetId, assetSha256, d, h, scene, url, visualSource, w])

  useEffect(() => onReady?.(), [onReady, prepared])

  return <primitive object={prepared} />
}
