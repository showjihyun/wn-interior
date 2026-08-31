import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'

const dist = path.resolve('dist')
const html = await readFile(path.join(dist, 'index.html'), 'utf8')
const entryMatch = html.match(/<script[^>]+src="\/assets\/([^"]+\.js)"/)
if (!entryMatch) throw new Error('bundle-entry-script-not-found')
const assets = path.join(dist, 'assets')
const chunks = (await readdir(assets)).filter((file) => file.endsWith('.js'))
const sizes = await Promise.all(
  chunks.map(async (file) => ({ file, bytes: (await stat(path.join(assets, file))).size }))
)
const javascript = await Promise.all(
  chunks.map(async (file) => ({ file, source: await readFile(path.join(assets, file), 'utf8') }))
)
const forbiddenLocalReviewMarkers = [
  '/__local-mesh-review__/',
  'artifacts/generated-mesh/quarantine',
  'mesh-ik-kivik-3seat-1787900563519',
  'd608c0fa3ff08abf6ddd75ec2eb9e41904f7f4777496662b8c9c6926f76677b3',
  'reference-ikea-dimma-49484765',
  '7ce04fb0e8e4a8c40c80a3ccff9346430e9e2da93422d212aa6d6373f8cbf049',
]
for (const marker of forbiddenLocalReviewMarkers) {
  const leakedChunk = javascript.find(({ source }) => source.includes(marker))
  if (leakedChunk) {
    throw new Error(
      `local review payload leaked into production bundle: ${marker} in ${leakedChunk.file}`
    )
  }
}
const bundledReviewAsset = (await readdir(assets)).find((file) => /\.(?:glb|gltf)$/i.test(file))
if (bundledReviewAsset) {
  throw new Error(`local review model leaked into production assets: ${bundledReviewAsset}`)
}
const entry = sizes.find((chunk) => chunk.file === entryMatch[1])
if (!entry) throw new Error('bundle-entry-file-not-found')
const catalogXlsx = sizes.find((chunk) => /^catalog-xlsx-[^.]+\.js$/.test(chunk.file))
if (!catalogXlsx) throw new Error('catalog-xlsx-lazy-chunk-not-found')
if (html.includes(`modulepreload`) && html.includes(catalogXlsx.file)) {
  throw new Error(`catalog XLSX parser must not be preloaded: ${catalogXlsx.file}`)
}
const largest = [...sizes].sort((left, right) => right.bytes - left.bytes)[0]
if (entry.bytes > 400_000) {
  throw new Error(`초기 JS entry 예산 초과: ${entry.file} ${entry.bytes}B > 400000B`)
}
if (largest.bytes > 800_000) {
  throw new Error(`단일 JS chunk 예산 초과: ${largest.file} ${largest.bytes}B > 800000B`)
}
console.log(
  `번들 예산 통과: entry ${entry.file} ${entry.bytes}B, largest ${largest.file} ${largest.bytes}B, chunks ${sizes.length}개`
)
