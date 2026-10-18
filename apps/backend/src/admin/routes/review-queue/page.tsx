import { defineRouteConfig } from "@medusajs/admin-sdk"
import { CheckCircle } from "@medusajs/icons"
import { Badge, Button, Container, Heading, Table, Text, Textarea, toast } from "@medusajs/ui"
import { Fragment, useCallback, useEffect, useState } from "react"
import { haantaApi, usdMinor } from "../../lib/api"
import { ErrorOrMfa } from "../../components/needs-mfa"

interface QueueRow {
  id: string
  title: string
  vendor: string
  kind: "new_product" | "change_to_live_product"
  submitted_at: string | null
  vendor_price_usd_minor: number
  retail_usd_minor: number
  changed_fields: string[]
  weight_missing: boolean
  size_chart_missing: boolean
  review_note: string | null
}

/**
 * Vendor submissions waiting for Haanta: new products and edits to live products (live products keep
 * their approved version until an edit is approved). Approve publishes; request changes sends a note.
 */
const ReviewQueuePage = () => {
  const [rows, setRows] = useState<QueueRow[] | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(() => {
    haantaApi<{ listings: QueueRow[] }>("/review-queue").then((r) => setRows(r.listings), setError)
  }, [])
  useEffect(load, [load])

  const act = async (row: QueueRow, action: "approve" | "request-changes") => {
    if (action === "request-changes" && note.trim().length < 3) {
      toast.error("Add a note for the designer (what should change?)")
      return
    }
    setBusy(row.id)
    try {
      await haantaApi(`/review-queue/${row.id}/${action}`, { method: "POST", body: JSON.stringify(note.trim() ? { note: note.trim() } : {}) })
      toast.success(action === "approve" ? `“${row.title}” approved and live` : `Changes requested from ${row.vendor}`)
      setOpen(null)
      setNote("")
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed")
    } finally {
      setBusy(null)
    }
  }

  if (error) return <ErrorOrMfa error={error} />

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <div>
          <Heading level="h1">Review queue</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            Oldest first. Retail prices include Haanta's markup and rounding.
          </Text>
        </div>
        <Button size="small" variant="secondary" onClick={load}>
          Refresh
        </Button>
      </div>
      {!rows ? (
        <Text className="text-ui-fg-subtle px-6 py-4">Loading…</Text>
      ) : rows.length === 0 ? (
        <Text className="text-ui-fg-subtle px-6 py-8">Nothing waiting. New vendor submissions appear here.</Text>
      ) : (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Listing</Table.HeaderCell>
              <Table.HeaderCell>Designer</Table.HeaderCell>
              <Table.HeaderCell>Type</Table.HeaderCell>
              <Table.HeaderCell>Vendor price → retail</Table.HeaderCell>
              <Table.HeaderCell>Checks</Table.HeaderCell>
              <Table.HeaderCell />
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {rows.map((r) => (
              <Fragment key={r.id}>
                <Table.Row>
                  <Table.Cell>
                    <Text size="small" weight="plus">
                      {r.title}
                    </Text>
                    <Text size="xsmall" className="text-ui-fg-muted">
                      {r.submitted_at ? new Date(r.submitted_at).toLocaleString() : ""}
                    </Text>
                  </Table.Cell>
                  <Table.Cell>{r.vendor}</Table.Cell>
                  <Table.Cell>
                    {r.kind === "new_product" ? (
                      <Badge size="small" color="blue">
                        New product
                      </Badge>
                    ) : (
                      <Badge size="small" color="purple" title={r.changed_fields.join(", ")}>
                        Edit: {r.changed_fields.slice(0, 3).join(", ") || "details"}
                        {r.changed_fields.length > 3 ? "…" : ""}
                      </Badge>
                    )}
                  </Table.Cell>
                  <Table.Cell>
                    {usdMinor(r.vendor_price_usd_minor)} → <strong>{usdMinor(r.retail_usd_minor)}</strong>
                  </Table.Cell>
                  <Table.Cell>
                    <div className="flex flex-wrap gap-1">
                      {r.weight_missing ? (
                        <Badge size="2xsmall" color="orange">
                          No weight
                        </Badge>
                      ) : null}
                      {r.size_chart_missing ? (
                        <Badge size="2xsmall" color="orange">
                          No size chart
                        </Badge>
                      ) : null}
                      {!r.weight_missing && !r.size_chart_missing ? (
                        <Badge size="2xsmall" color="green">
                          Complete
                        </Badge>
                      ) : null}
                    </div>
                  </Table.Cell>
                  <Table.Cell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button size="small" isLoading={busy === r.id && open !== r.id} onClick={() => act(r, "approve")}>
                        Approve
                      </Button>
                      <Button
                        size="small"
                        variant="secondary"
                        onClick={() => {
                          setOpen(open === r.id ? null : r.id)
                          setNote("")
                        }}
                      >
                        Request changes
                      </Button>
                    </div>
                  </Table.Cell>
                </Table.Row>
                {open === r.id ? (
                  <Table.Row>
                    <td colSpan={6} className="px-6">
                      <div className="flex flex-col gap-2 py-2">
                        <Textarea placeholder={`Note for ${r.vendor} (e.g. "Please add the garment weight and a size chart")`} value={note} onChange={(e) => setNote(e.target.value)} rows={2} autoFocus />
                        <div>
                          <Button size="small" variant="danger" isLoading={busy === r.id} onClick={() => act(r, "request-changes")}>
                            Send back to designer
                          </Button>
                        </div>
                      </div>
                    </td>
                  </Table.Row>
                ) : null}
              </Fragment>
            ))}
          </Table.Body>
        </Table>
      )}
    </Container>
  )
}

export const config = defineRouteConfig({ label: "Review queue", icon: CheckCircle })
export default ReviewQueuePage
