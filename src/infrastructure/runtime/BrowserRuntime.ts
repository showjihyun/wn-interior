import type { Clock, Delay, IdGenerator, Scheduler } from '../../application/ports'

export class BrowserIdGenerator implements IdGenerator {
  next(): string {
    return globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2, 10)
  }
}

export class SystemClock implements Clock {
  now(): string {
    return new Date().toISOString()
  }
}

export class SystemDelay implements Delay {
  wait(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds))
  }
}

export class BrowserScheduler implements Scheduler {
  schedule(task: () => void, delayMs: number) {
    const timer = setTimeout(task, delayMs)
    return { cancel: () => clearTimeout(timer) }
  }
}
