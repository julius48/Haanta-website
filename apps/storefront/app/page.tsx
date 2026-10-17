import { connection } from "next/server"
import { Container, Wordmark } from "@haanta/ui"

export default async function HomePage() {
  await connection()
  return (
    <main id="main">
      <Container>
        <h1>
          <Wordmark />
        </h1>
        <p>Curated African fashion.</p>
      </Container>
    </main>
  )
}
