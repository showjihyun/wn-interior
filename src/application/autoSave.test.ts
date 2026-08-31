import { describe, expect, it, vi } from 'vitest'
import type { ProjectService, ProjectSnapshot } from './projectService'
import type { ScheduledTask, Scheduler } from './ports'
import { createAutoSave } from './autoSave'

describe('AutoSave', () => {
  it('새 변경이 오면 이전 예약을 취소하고 마지막 스냅샷만 저장한다', () => {
    const tasks: Array<{ run: () => void; cancelled: boolean }> = []
    const scheduler: Scheduler = {
      schedule(run): ScheduledTask {
        const task = { run, cancelled: false }
        tasks.push(task)
        return { cancel: () => (task.cancelled = true) }
      },
    }
    const save = vi.fn()
    const projects = { save } as unknown as ProjectService
    const autoSave = createAutoSave(projects, scheduler)
    const snapshot = (name: string): ProjectSnapshot => ({
      id: 'p1',
      name,
      plan: { unit: 'mm', wallHeight: 2400, walls: [], openings: [], rooms: [] },
      placements: [],
      customProducts: [],
    })

    autoSave.schedule(snapshot('first'))
    autoSave.schedule(snapshot('last'))
    tasks.filter((task) => !task.cancelled).forEach((task) => task.run())

    expect(tasks[0].cancelled).toBe(true)
    expect(save).toHaveBeenCalledOnce()
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ name: 'last' }))
  })
})
