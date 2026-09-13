/**
 * "Use my current location" for the pickup address.
 *
 * Position from the browser; the street name from OpenStreetMap's Nominatim,
 * because the web has no built-in reverse geocoder the way a phone does.
 * Nominatim is asked once per tap, never in a loop, which keeps well inside
 * its one-request-a-second policy.
 */

export class LocationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LocationError'
  }
}

export interface Pin {
  latitude: number
  longitude: number
  street: string
  city: string
  state: string
}

function currentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new LocationError('Turn on location services first.'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      resolve,
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          reject(new LocationError('Location permission is needed to drop your pin.'))
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          reject(new LocationError('Turn on location services first.'))
        } else {
          reject(new LocationError('Could not get your location. Type the address instead.'))
        }
      },
      { enableHighAccuracy: true, timeout: 18_000, maximumAge: 0 },
    )
  })
}

async function reverseGeocode(lat: number, lng: number): Promise<Omit<Pin, 'latitude' | 'longitude'>> {
  const empty = { street: '', city: '', state: '' }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  try {
    const url =
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&zoom=18` +
      `&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}`
    const res = await fetch(url, {
      signal: controller.signal,
      credentials: 'omit',
      headers: { Accept: 'application/json', 'Accept-Language': 'en' },
    })
    if (!res.ok) return empty
    const body = (await res.json()) as { address?: Record<string, string> }
    const a = body.address ?? {}
    const road = [a.house_number, a.road].filter(Boolean).join(' ')
    return {
      street: [road, a.suburb ?? a.neighbourhood ?? a.quarter].filter(Boolean).join(', '),
      city: a.city ?? a.town ?? a.village ?? a.municipality ?? a.county ?? '',
      state: a.state ?? '',
    }
  } catch {
    return empty
  } finally {
    clearTimeout(timer)
  }
}

/**
 * The vendor's position and, when it can be found, the street it is on. A
 * pin without a street name is still a usable pin.
 */
export async function dropPin(): Promise<Pin> {
  const position = await currentPosition()
  const { latitude, longitude } = position.coords
  const place = await reverseGeocode(latitude, longitude)
  return { latitude, longitude, ...place }
}
