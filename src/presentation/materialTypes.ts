export interface FinishMaterialView {
  id: string
  kind: 'floor' | 'wall'
  name: string
  tex:
    | 'vinyl600'
    | 'wood'
    | 'woodDark'
    | 'tile'
    | 'tileSmall'
    | 'concrete'
    | 'wallpaperPlain'
    | 'wallpaperGray'
    | 'fabricWall'
    | 'woodSlat'
    | 'accent'
  tileMm: number
  baseColor: string
}
