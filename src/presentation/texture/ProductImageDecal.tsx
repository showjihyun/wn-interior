import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import type { Product, ProductAppearance } from '../../domain/model'
import { useAppRuntime } from '../AppRuntimeContext'
import { fitImageWithinBounds } from './productTextureMath'

export function ProductImageDecal({
  product,
  onError,
}: {
  product: Product
  onError?: (error: unknown) => void
}) {
  const { productTextureEngine } = useAppRuntime()
  const appearance = product.appearance
  const [texture, setTexture] = useState<THREE.Texture | null>(null)
  const onErrorRef = useRef(onError)
  onErrorRef.current = onError

  useEffect(() => {
    if (!appearance) return
    let active = true
    productTextureEngine
      .acquire(appearance)
      .then((loaded) => {
        if (active) setTexture(loaded)
      })
      .catch((error) => {
        if (active) {
          setTexture(null)
          onErrorRef.current?.(error)
        }
      })
    return () => {
      active = false
      productTextureEngine.release(appearance)
    }
  }, [appearance, productTextureEngine])

  if (!appearance || !texture) return null
  return <ProjectedImage product={product} appearance={appearance} texture={texture} />
}

function ProjectedImage({
  product,
  appearance,
  texture,
}: {
  product: Product
  appearance: ProductAppearance
  texture: THREE.Texture
}) {
  const { w, d, h } = product.dims
  const top = appearance.projection === 'top'
  const maxWidth = w * (appearance.projection === 'cutout' ? 1.04 : 0.98)
  const maxHeight = top ? d * 0.98 : h * (appearance.projection === 'curtain' ? 0.96 : 1.02)
  const image = (texture.image ?? {}) as {
    width?: number
    height?: number
    naturalWidth?: number
    naturalHeight?: number
  }
  const plane = fitImageWithinBounds(
    image.width ?? image.naturalWidth ?? maxWidth,
    image.height ?? image.naturalHeight ?? maxHeight,
    maxWidth,
    maxHeight
  )
  return (
    <mesh
      position={top ? [0, h + 7, 0] : [0, h * 0.51, d / 2 + 7]}
      rotation={top ? [-Math.PI / 2, 0, 0] : [0, 0, 0]}
      renderOrder={4}
    >
      <planeGeometry args={[plane.width, plane.height]} />
      <meshStandardMaterial
        map={texture}
        transparent
        alphaTest={0.12}
        depthWrite={false}
        roughness={appearance.projection === 'top' ? 0.34 : 0.72}
        metalness={product.shape === 'faucet' ? 0.5 : 0.05}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}
