import config from "@haanta/config/eslint-next"
export default [...config, { ignores: [".next/**", "next-env.d.ts"] }]
