const url = process.argv[2] ?? 'http://127.0.0.1:8980/health'
const response = await fetch(url)
if (!response.ok) throw new Error(`triposr-health-http-${response.status}`)
const health = (await response.json()) as {
  ok?: boolean
  ready?: boolean
  model?: string
  device?: string
  error?: string | null
}
console.log(JSON.stringify(health, null, 2))
if (!health.ok || !health.ready || health.model !== 'stabilityai/TripoSR') {
  throw new Error(`triposr-service-not-ready:${health.error ?? health.device ?? 'unknown'}`)
}
