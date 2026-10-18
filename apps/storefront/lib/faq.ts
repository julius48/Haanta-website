/**
 * Frequently asked questions. Written as direct answers (first sentence answers the question) so
 * search and answer engines can quote them. Shown on /faq and the help pages, with FAQPage JSON-LD.
 */
export interface FaqItem {
  q: string
  a: string
  topic: "shipping" | "returns" | "sizing" | "orders" | "about"
}

export const FAQ: FaqItem[] = [
  {
    topic: "shipping",
    q: "Does Haanta ship to the United States and Canada?",
    a: "Yes. Haanta ships to the United States, Canada and Mexico. Pieces ship either from our hub in Houston, Texas, or directly from our designers' studios in Nigeria.",
  },
  {
    topic: "shipping",
    q: "How long does delivery take?",
    a: "Pieces already in our Houston hub arrive in 2-5 working days. Pieces shipping from Nigeria arrive in 10-21 days with standard shipping, or 2-3 days with DHL Express. Made-to-order and pre-order pieces are shipped after production.",
  },
  {
    topic: "shipping",
    q: "Will I pay import duties or taxes on delivery?",
    a: "No. Prices for the United States and Canada already include import duties and taxes, so there are no extra charges when your order arrives.",
  },
  {
    topic: "shipping",
    q: "Is shipping free?",
    a: "Standard shipping is free on orders over $150. Below that, standard shipping costs $20. Express shipping from Nigeria is priced by weight at checkout.",
  },
  {
    topic: "returns",
    q: "What is Haanta's return policy?",
    a: "You can return ready-to-wear pieces within 14 days of delivery for a refund. Made-to-order pieces are cut to your measurements and can only be returned if they arrive faulty.",
  },
  {
    topic: "sizing",
    q: "How do I find my size?",
    a: "Every product page has the designer's own size chart with US and UK sizes, plus fit notes such as 'runs long'. Sizing varies between designers, so check the chart for each piece.",
  },
  {
    topic: "sizing",
    q: "What does made to order mean?",
    a: "Made-to-order pieces are cut and sewn for you after you order. You enter your measurements (for example bust, waist, hips and height) when adding the piece to your bag, and the lead time is shown on the product page.",
  },
  {
    topic: "orders",
    q: "What is a pre-order?",
    a: "A pre-order lets you reserve a piece before it is produced. Delivery times for pre-orders are counted from the end of production, as shown on the product page.",
  },
  {
    topic: "orders",
    q: "How do I track my order?",
    a: "Use the Track order page with your order number and email address, or sign in to your account to see every order and its tracking updates.",
  },
  {
    topic: "orders",
    q: "Which payment methods does Haanta accept?",
    a: "Haanta accepts major credit and debit cards, Apple Pay, Google Pay, Link, Klarna and PayPal. Card details are handled by Stripe and never stored by Haanta.",
  },
  {
    topic: "about",
    q: "What is Haanta?",
    a: "Haanta is a curated marketplace for African fashion. We vet independent designers, mostly from Nigeria, check every piece, and ship to customers in the United States and Canada.",
  },
  {
    topic: "about",
    q: "Are Haanta's designers independent?",
    a: "Yes. Every brand on Haanta is an independent African designer or studio. Each piece is credited to its maker, and every designer has a page telling their story.",
  },
]
