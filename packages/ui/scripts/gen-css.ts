import { writeFileSync } from "node:fs"
import { join } from "node:path"
import { toCssVariables } from "../src/tokens"

writeFileSync(join(import.meta.dirname, "..", "src", "tokens.css"), toCssVariables())
console.log("wrote src/tokens.css")
