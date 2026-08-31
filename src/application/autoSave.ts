import type { ProjectService, ProjectSnapshot } from './projectService'
import type { ScheduledTask, Scheduler } from './ports'

export interface AutoSave {
  schedule(snapshot: ProjectSnapshot): void
  cancel(): void
}

export function createAutoSave(
  projects: ProjectService,
  scheduler: Scheduler,
  delayMs = 600
): AutoSave {
  let pending: ScheduledTask | null = null
  return {
    schedule(snapshot) {
      pending?.cancel()
      pending = scheduler.schedule(() => {
        pending = null
        projects.save(snapshot)
      }, delayMs)
    },
    cancel() {
      pending?.cancel()
      pending = null
    },
  }
}
