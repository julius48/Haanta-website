import type { Metadata } from "next"
import Link from "next/link"
import { Chip } from "@/components/chips"
import { SignOutButton } from "@/components/sign-out"
import { requireVendor } from "@/lib/server/session"

export const metadata: Metadata = { title: "Account" }

const STATUS: Record<string, { label: string; tone: string }> = {
  active: { label: "Approved", tone: "live" },
  pending: { label: "Awaiting approval", tone: "pending" },
  paused: { label: "Paused", tone: "changes_requested" },
  rejected: { label: "Not approved", tone: "changes_requested" },
}

export default async function AccountPage() {
  const me = await requireVendor()
  const st = STATUS[me.vendor.status] ?? { label: me.vendor.status, tone: "info" }
  return (
    <>
      <h1>Account</h1>
      <div className="v-grid v-grid--2" style={{ alignItems: "start" }}>
        <section className="v-card" aria-labelledby="profile-h">
          <h2 id="profile-h">Your profile</h2>
          <dl className="v-dl">
            <dt>Name</dt>
            <dd>{me.user.name}</dd>
            <dt>Email</dt>
            <dd>
              {me.user.email} {me.user.email_verified ? <Chip tone="live">Verified</Chip> : <Chip tone="pending">Not verified</Chip>}
            </dd>
            <dt>Role</dt>
            <dd style={{ textTransform: "capitalize" }}>{me.user.role}</dd>
          </dl>
        </section>
        <section className="v-card" aria-labelledby="store-h">
          <h2 id="store-h">Your store</h2>
          <dl className="v-dl">
            <dt>Brand</dt>
            <dd>{me.vendor.name}</dd>
            <dt>Status</dt>
            <dd>
              <Chip tone={st.tone}>{st.label}</Chip>
            </dd>
            {me.vendor.region ? (
              <>
                <dt>Region</dt>
                <dd>{me.vendor.region}</dd>
              </>
            ) : null}
            {me.vendor.origin_country ? (
              <>
                <dt>Country</dt>
                <dd>{me.vendor.origin_country}</dd>
              </>
            ) : null}
          </dl>
          <p style={{ marginTop: "var(--space-4)" }}>
            <Link href="/store">Edit your store page</Link>
          </p>
        </section>
        <section className="v-card" aria-labelledby="security-h">
          <h2 id="security-h">Security</h2>
          <dl className="v-dl">
            <dt>Two-factor</dt>
            <dd data-testid="mfa-status">{me.mfa.enrolled ? <Chip tone="live">On</Chip> : <Chip tone="changes_requested">Off</Chip>}</dd>
            <dt>This session</dt>
            <dd>{me.mfa.verified ? "Verified with your authenticator app" : "Not verified"}</dd>
          </dl>
          <p className="v-small v-muted" style={{ marginTop: "var(--space-4)" }}>
            Lost your phone? Use a recovery code when you sign in, or contact Haanta to reset two-factor authentication.
          </p>
          <p>
            <Link href="/reset-password">Change your password</Link>
          </p>
        </section>
        <section className="v-card" aria-labelledby="signout-h">
          <h2 id="signout-h">Sign out</h2>
          <p className="v-small">Sign out on shared or public devices.</p>
          <SignOutButton variant="primary" />
        </section>
      </div>
    </>
  )
}
