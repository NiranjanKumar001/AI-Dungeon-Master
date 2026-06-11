// Minimal Redis mock — prevents real connection in tests
const store: Record<string, string> = {}

class RedisMock {
  async connect() { return this }
  async get(key: string) { return store[key] ?? null }
  async set(key: string, value: string) { store[key] = value; return 'OK' }
  async del(...keys: string[]) { keys.forEach(k => delete store[k]); return keys.length }
  async keys(pattern: string) {
    const regex = new RegExp('^' + pattern.replace('*', '.*') + '$')
    return Object.keys(store).filter(k => regex.test(k))
  }
  pipeline() {
    const cmds: Array<() => Promise<unknown>> = []
    const p = {
      set: (_k: string, _v: unknown) => { cmds.push(async () => 'OK'); return p },
      get: (k: string)               => { cmds.push(async () => store[k] ?? null); return p },
      exec: async () => cmds.map(fn => [null, fn()]),
    }
    return p
  }
  on(_event: string, _cb: unknown) { return this }
}

export default RedisMock
module.exports = RedisMock
