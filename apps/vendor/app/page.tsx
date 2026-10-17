import { connection } from "next/server"
import { Container, Wordmark } from "@haanta/ui"

export default async function VendorHome() {
  await connection()
  return (
    <main id="main">
      <Container>
        <h1>
          <Wordmark /> Partner Portal
        </h1>
      </Container>
    </main>
  )
}
