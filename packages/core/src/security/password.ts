import { createHash } from "node:crypto"

export const PASSWORD_MIN_LENGTH = 12
export const PASSWORD_MAX_LENGTH = 128

export type PasswordProblem = "too_short" | "too_long" | "contains_email" | "breached"

/** Local checks (ASVS 2.1): length 12–128, any characters allowed, no composition rules, not the email. */
export function checkPasswordPolicy(password: string, email?: string): PasswordProblem[] {
  const problems: PasswordProblem[] = []
  const length = [...password].length
  if (length < PASSWORD_MIN_LENGTH) problems.push("too_short")
  if (length > PASSWORD_MAX_LENGTH) problems.push("too_long")
  const local = email?.split("@")[0]?.toLowerCase()
  if (local && local.length >= 4 && password.toLowerCase().includes(local)) problems.push("contains_email")
  return problems
}

export interface BreachedPasswordChecker {
  /** True if the password appears in a breach corpus. Must fail closed only if configured to. */
  isBreached(password: string): Promise<boolean>
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

/**
 * Have I Been Pwned range API (k-anonymity: only the first 5 SHA-1 hex chars leave the server).
 * If the API is unreachable we allow the password (fail open) but the caller logs a warning.
 */
export function createHibpChecker(opts: { fetch?: FetchLike; timeoutMs?: number } = {}): BreachedPasswordChecker {
  const doFetch: FetchLike = opts.fetch ?? ((i, init) => fetch(i, init))
  return {
    async isBreached(password) {
      const hash = createHash("sha1").update(password, "utf8").digest("hex").toUpperCase()
      const prefix = hash.slice(0, 5)
      const suffix = hash.slice(5)
      try {
        const res = await doFetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
          headers: { "Add-Padding": "true" },
          signal: AbortSignal.timeout(opts.timeoutMs ?? 2000),
        })
        if (!res.ok) return false
        const body = await res.text()
        return body.split("\n").some((line) => {
          const [s, count] = line.trim().split(":")
          return s === suffix && Number(count) > 0
        })
      } catch {
        return false
      }
    },
  }
}

/** Offline checker with common breached passwords, used locally and in tests. */
export const COMMON_BREACHED_PASSWORDS = [
  "password1234",
  "123456789012",
  "qwertyuiop12",
  "iloveyou1234",
  "Password123!",
  "password123!",
  "letmein12345",
  "welcome12345",
  "admin1234567",
  "haanta123456",
]

export function createLocalBreachedChecker(list: string[] = COMMON_BREACHED_PASSWORDS): BreachedPasswordChecker {
  const set = new Set(list.map((p) => p.toLowerCase()))
  return { isBreached: async (p) => set.has(p.toLowerCase()) }
}

export async function validatePassword(
  password: string,
  email: string | undefined,
  checker: BreachedPasswordChecker,
): Promise<PasswordProblem[]> {
  const problems = checkPasswordPolicy(password, email)
  if (problems.length === 0 && (await checker.isBreached(password))) problems.push("breached")
  return problems
}

export const PASSWORD_PROBLEM_MESSAGES: Record<PasswordProblem, string> = {
  too_short: `Use at least ${PASSWORD_MIN_LENGTH} characters.`,
  too_long: `Use at most ${PASSWORD_MAX_LENGTH} characters.`,
  contains_email: "Don't include your email address in your password.",
  breached: "This password has appeared in a data breach. Choose a different one.",
}
