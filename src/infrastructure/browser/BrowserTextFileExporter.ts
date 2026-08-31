import type { TextFileExporter } from '../../application/ports'

export class BrowserTextFileExporter implements TextFileExporter {
  download(text: string, filename: string, mimeType: string): void {
    const url = URL.createObjectURL(new Blob([text], { type: mimeType }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    anchor.click()
    URL.revokeObjectURL(url)
  }
}
