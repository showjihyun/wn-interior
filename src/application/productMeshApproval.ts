/** 브라우저에 공개되는 PII 없는 생성 메시 manifest 항목. */
export interface ApprovedProductMesh {
  assetId: string
  productId: string
  productFingerprint: string
  uri: string
  sha256: string
  byteLength: number
  visualOnly: true
  publishedAt: string
  generatorLabel: string
}
