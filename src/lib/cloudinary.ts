/**
 * Photos: picking, shrinking, and the unsigned Cloudinary upload.
 *
 * Unsigned preset, as in the Flutter app: this app never holds the
 * Cloudinary API secret, which is the only safe way to upload straight from
 * a browser. The preset must exist on the cloud AND be set to unsigned, or
 * every upload answers 400 "Upload preset not found" — so Cloudinary's own
 * message is surfaced rather than guessed at.
 */

const CLOUD = (import.meta.env.VITE_CLOUDINARY_CLOUD as string | undefined)?.trim() || 'dwshyzftx'
const PRESET = (import.meta.env.VITE_CLOUDINARY_PRESET as string | undefined)?.trim() || 'blorbmart'
const MAX_BYTES = 10 * 1024 * 1024

/** A photo problem worth showing the vendor, in words already fit to show. */
export class UploadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UploadError'
  }
}

/**
 * Opens the photo picker. Call it straight from a tap handler: browsers only
 * open a file dialog inside the gesture that asked for it.
 *
 * `capture` opens the camera on phones — a vendor standing in their own shop
 * usually has the photo they want in front of them, not in their roll.
 */
export function pickImages({ multiple = false, capture = false } = {}): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.multiple = multiple
    if (capture) input.setAttribute('capture', 'environment')
    input.style.display = 'none'
    let settled = false
    const finish = (files: File[]) => {
      if (settled) return
      settled = true
      input.remove()
      resolve(files)
    }
    input.addEventListener('change', () => finish(Array.from(input.files ?? [])))
    input.addEventListener('cancel', () => finish([]))
    document.body.appendChild(input)
    input.click()
  })
}

/**
 * Shrinks a photo on the device before it goes anywhere — image_picker's
 * maxWidth and imageQuality.
 *
 * A 12MP phone photo is 4MB over a campus connection, and no screen renders
 * one above 1600px. Re-encoding also strips the EXIF block, which on a phone
 * photo includes the GPS position it was taken at: a vendor's home address
 * has no business riding along on a picture of their jollof.
 */
export async function prepareImage(file: File, maxWidth: number, quality = 0.82): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new UploadError('That file is not a photo.')

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    throw new UploadError('That photo format is not supported. Try a JPEG or PNG.')
  }

  const scale = Math.min(1, maxWidth / bitmap.width)
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new UploadError('Could not read that photo.')
  // JPEG has no transparency; a transparent logo would otherwise turn black.
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, width, height)
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
  if (!blob) throw new UploadError('Could not read that photo.')
  return blob
}

/** Uploads to Cloudinary and returns the secure URL. Throws UploadError. */
export async function uploadImage(image: Blob, folder = 'products'): Promise<string> {
  if (image.size > MAX_BYTES) throw new UploadError('That photo is too large. Try a smaller one.')

  const form = new FormData()
  form.append('file', image, 'photo.jpg')
  form.append('upload_preset', PRESET)
  form.append('folder', `blorbmart/${folder}`)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 60_000)
  let res: Response
  let body: Record<string, unknown> = {}
  try {
    res = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(CLOUD)}/image/upload`, {
      method: 'POST',
      body: form,
      signal: controller.signal,
      credentials: 'omit',
    })
    body = (await res.json().catch(() => ({}))) as Record<string, unknown>
  } catch {
    if (controller.signal.aborted) {
      throw new UploadError('That upload timed out. Check your connection and try again.')
    }
    throw new UploadError('Could not reach the photo service. Check your connection.')
  } finally {
    clearTimeout(timer)
  }

  if (res.status !== 200) {
    const reason = (body.error as { message?: unknown } | undefined)?.message
    throw new UploadError(`That upload failed: ${typeof reason === 'string' ? reason : `status ${res.status}`}`)
  }

  const url = body.secure_url
  // Only a Cloudinary HTTPS URL is ever written to a store or a product.
  if (typeof url !== 'string' || !url.startsWith('https://res.cloudinary.com/')) {
    throw new UploadError('That upload failed. Please try again.')
  }
  return url
}
