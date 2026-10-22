/** Save something to the user's disk by clicking a temporary link. */

function save(filename: string, href: string) {
  const a = document.createElement('a')
  a.href = href
  a.download = filename
  document.body.append(a)
  a.click()
  a.remove()
}

export function downloadText(filename: string, text: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: mime }))
  save(filename, url)
  URL.revokeObjectURL(url)
}

export const downloadDataUrl = (filename: string, dataUrl: string): void => save(filename, dataUrl)
