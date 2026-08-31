import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

interface RetailProduct {
  id?: string
  appearance?: { textureUrl?: string; sha256?: string }
}

async function main() {
  const root = process.cwd()
  const catalogPath = resolve(root, 'src/infrastructure/reference-data/data/brands/ikea.json')
  const catalog = JSON.parse(await readFile(catalogPath, 'utf8')) as {
    products?: RetailProduct[]
  }
  const retailProducts = (catalog.products ?? []).filter((product) => product.appearance)
  if (retailProducts.length < 6)
    throw new Error(`IKEA texture assets missing: ${retailProducts.length}/6`)

  for (const product of retailProducts) {
    const textureUrl = product.appearance?.textureUrl ?? ''
    const expected = product.appearance?.sha256 ?? ''
    if (!textureUrl.startsWith('/catalog/ikea/')) {
      throw new Error(`Invalid texture URL: ${product.id}`)
    }
    const file = await readFile(resolve(root, 'public', textureUrl.replace(/^\//, '')))
    const actual = createHash('sha256').update(file).digest('hex')
    if (actual !== expected) {
      throw new Error(`Texture hash mismatch: ${product.id} (${actual})`)
    }
  }
  console.log(`IKEA 실상품 이미지 계약 통과: ${retailProducts.length}개`)
}

void main()
