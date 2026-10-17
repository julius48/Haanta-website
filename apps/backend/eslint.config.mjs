import config from "@haanta/config/eslint"
export default [...config, { ignores: [".medusa/**", "jest.config.js", "integration-tests/setup.js", "medusa-config.ts"] }]
