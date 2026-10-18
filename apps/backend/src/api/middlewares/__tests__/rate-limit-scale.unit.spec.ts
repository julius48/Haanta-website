import { effectiveRule } from "../security"

const rule = { name: "checkout", limit: 10, windowMs: 60_000 }

describe("effectiveRule", () => {
  it("keeps the configured limit by default", () => {
    expect(effectiveRule(rule, { NODE_ENV: "development" })).toEqual(rule)
  })

  it("scales limits for local e2e runs", () => {
    expect(effectiveRule(rule, { NODE_ENV: "development", RATE_LIMIT_SCALE: "20" }).limit).toBe(200)
  })

  it("never weakens limits in production", () => {
    expect(effectiveRule(rule, { NODE_ENV: "production", RATE_LIMIT_SCALE: "20" })).toEqual(rule)
  })

  it("is ignored under the test runner", () => {
    expect(effectiveRule(rule, { NODE_ENV: "test", TEST_TYPE: "integration:http", RATE_LIMIT_SCALE: "20" })).toEqual(rule)
  })

  it("ignores invalid or shrinking scales", () => {
    expect(effectiveRule(rule, { RATE_LIMIT_SCALE: "abc" })).toEqual(rule)
    expect(effectiveRule(rule, { RATE_LIMIT_SCALE: "0.5" })).toEqual(rule)
  })
})
