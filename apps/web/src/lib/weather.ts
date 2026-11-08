/**
 * Today's weather where the device is. Free APIs, no keys:
 *   - Open-Meteo for the forecast   https://open-meteo.com
 *   - BigDataCloud for the place name (client-side reverse geocoding)
 */
import type { Locale } from './types'

export const WEATHER_COMMANDS = ['/thời-tiết', '/weather', '/dự-báo']
const COMMAND_RE = /^\/(thời-tiết|thoi-tiet|weather|dự-báo|du-bao)$/i

export function isWeatherCommand(text: string) {
  return COMMAND_RE.test(text.trim().normalize('NFC'))
}

export interface WeatherReport {
  place: string
  lat: number
  lon: number
  /** Open-Meteo / WMO weather code. */
  code: number
  isDay: boolean
  temp: number
  feelsLike: number
  humidity: number
  wind: number
  tempMax: number
  tempMin: number
  /** Chance of rain today, 0–100. */
  rainChance: number
  /** Rain today, mm. */
  rainSum: number
  uv: number
  sunrise: string
  sunset: string
  /** Next hours: time + temp + rain chance. */
  hours: { time: string; temp: number; rain: number; code: number }[]
  fetchedAt: string
}

export type WeatherError = 'denied' | 'unavailable' | 'network'

export function getPosition(): Promise<GeolocationCoordinates> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject('unavailable' satisfies WeatherError)
    navigator.geolocation.getCurrentPosition(
      (p) => resolve(p.coords),
      (e) => reject((e.code === e.PERMISSION_DENIED ? 'denied' : 'unavailable') satisfies WeatherError),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 10 * 60_000 },
    )
  })
}

async function placeName(lat: number, lon: number, locale: Locale) {
  try {
    const res = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=${locale}`,
    )
    const j = (await res.json()) as { locality?: string; city?: string; principalSubdivision?: string; countryName?: string }
    const parts = [j.locality || j.city, j.principalSubdivision].filter((x, i, a) => x && a.indexOf(x) === i)
    return parts.join(', ') || j.countryName || ''
  } catch {
    return ''
  }
}

export async function fetchWeather(locale: Locale): Promise<WeatherReport> {
  const { latitude: lat, longitude: lon } = await getPosition()
  const q = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day',
    hourly: 'temperature_2m,precipitation_probability,weather_code',
    daily: 'temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,uv_index_max,sunrise,sunset',
    timezone: 'auto',
    forecast_days: '2',
  })
  let j: {
    current: { time: string; temperature_2m: number; apparent_temperature: number; relative_humidity_2m: number; weather_code: number; wind_speed_10m: number; is_day: number }
    hourly: { time: string[]; temperature_2m: number[]; precipitation_probability: number[]; weather_code: number[] }
    daily: { temperature_2m_max: number[]; temperature_2m_min: number[]; precipitation_probability_max: number[]; precipitation_sum: number[]; uv_index_max: number[]; sunrise: string[]; sunset: string[] }
  }
  const [res, place] = await Promise.all([
    fetch(`https://api.open-meteo.com/v1/forecast?${q}`).catch(() => null),
    placeName(lat, lon, locale),
  ])
  if (!res?.ok) throw 'network' satisfies WeatherError
  try {
    j = await res.json()
  } catch {
    throw 'network' satisfies WeatherError
  }
  const c = j.current
  const d = j.daily
  // Hourly times are local to the place; start from the current hour.
  const start = Math.max(0, j.hourly.time.findIndex((t) => t >= c.time.slice(0, 13)))
  const hours = j.hourly.time.slice(start, start + 6).map((time, i) => ({
    time: time.slice(11, 16),
    temp: Math.round(j.hourly.temperature_2m[start + i]),
    rain: j.hourly.precipitation_probability[start + i] ?? 0,
    code: j.hourly.weather_code[start + i],
  }))
  return {
    place, lat, lon,
    code: c.weather_code,
    isDay: c.is_day === 1,
    temp: Math.round(c.temperature_2m),
    feelsLike: Math.round(c.apparent_temperature),
    humidity: Math.round(c.relative_humidity_2m),
    wind: Math.round(c.wind_speed_10m),
    tempMax: Math.round(d.temperature_2m_max[0]),
    tempMin: Math.round(d.temperature_2m_min[0]),
    rainChance: d.precipitation_probability_max[0] ?? 0,
    rainSum: d.precipitation_sum[0] ?? 0,
    uv: Math.round(d.uv_index_max[0] ?? 0),
    sunrise: d.sunrise[0]?.slice(11, 16) ?? '',
    sunset: d.sunset[0]?.slice(11, 16) ?? '',
    hours,
    fetchedAt: new Date().toISOString(),
  }
}

/** WMO code → i18n key + icon. */
export function describe(code: number, isDay = true): { key: string; icon: string } {
  if (code === 0) return { key: 'clear', icon: isDay ? '☀️' : '🌙' }
  if (code <= 2) return { key: 'partly', icon: isDay ? '⛅' : '☁️' }
  if (code === 3) return { key: 'cloudy', icon: '☁️' }
  if (code === 45 || code === 48) return { key: 'fog', icon: '🌫️' }
  if (code >= 51 && code <= 57) return { key: 'drizzle', icon: '🌦️' }
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return { key: code >= 65 || code === 82 ? 'heavyRain' : 'rain', icon: '🌧️' }
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { key: 'snow', icon: '❄️' }
  if (code >= 95) return { key: 'storm', icon: '⛈️' }
  return { key: 'cloudy', icon: '☁️' }
}

/** Rain, showers, thunderstorms → show the rain effect. */
export function isWet(code: number) {
  return (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95
}
export function isStorm(code: number) {
  return code >= 95
}
