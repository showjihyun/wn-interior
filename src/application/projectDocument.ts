import type { Project } from '../domain/model'

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object'

export class InvalidProjectDocumentError extends Error {
  constructor() {
    super('invalid-project-document')
    this.name = 'InvalidProjectDocumentError'
  }
}

export function importProjectDocument(text: string): Project {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new InvalidProjectDocumentError()
  }
  if (
    !record(parsed) ||
    parsed.version !== 1 ||
    typeof parsed.name !== 'string' ||
    !record(parsed.plan) ||
    parsed.plan.unit !== 'mm' ||
    !Array.isArray(parsed.plan.walls) ||
    !Array.isArray(parsed.plan.openings) ||
    !Array.isArray(parsed.plan.rooms) ||
    !Array.isArray(parsed.placements) ||
    !Array.isArray(parsed.customProducts)
  ) {
    throw new InvalidProjectDocumentError()
  }
  return parsed as unknown as Project
}

export function exportProjectDocument(project: Project): string {
  return JSON.stringify(project, null, 2)
}
