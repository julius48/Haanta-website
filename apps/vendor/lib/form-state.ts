/** State returned by form Server Actions (used with useActionState). Shared by server and client. */
export interface FormState {
  error?: string
  message?: string
  fieldErrors?: Record<string, string>
  /** Password policy problems from `code: weak_password`. */
  problems?: string[]
  values?: Record<string, string>
}

/** Result of a Server Action called directly from client code. */
export type ActionResult<T = undefined> = { ok: true; data: T; message?: string } | { ok: false; error: string; fieldErrors?: Record<string, string>; problems?: string[] }
