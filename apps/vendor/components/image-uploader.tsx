"use client"

import Image from "next/image"
import { useId, useState } from "react"
import { signUploadAction } from "@/lib/actions/products"
import { ACCEPTED_IMAGE_TYPES, isAllowedUploadTarget, localUploadUrl, validateUploadFile, type UploadPurpose } from "@/lib/upload"

const BACKEND_URL = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL ?? "http://localhost:9000"

/** Signed direct upload from the browser: sign on our server, then send the file straight to the host. */
async function uploadFile(file: File, purpose: UploadPurpose): Promise<string> {
  const sig = await signUploadAction({ purpose, content_type: file.type, size: file.size })
  if (!sig.ok) throw new Error(sig.error)
  const s = sig.data
  if (!isAllowedUploadTarget(s.upload_url, BACKEND_URL)) throw new Error("Upload target not allowed")
  let res: Response
  if (s.provider === "local") {
    res = await fetch(localUploadUrl(s), { method: "POST", headers: { "content-type": file.type }, body: file, credentials: "omit" })
  } else {
    const body = new FormData()
    for (const [k, v] of Object.entries(s.fields)) body.append(k, v)
    body.append("file", file)
    res = await fetch(s.upload_url, { method: "POST", body, credentials: "omit" })
  }
  const json = (await res.json().catch(() => null)) as { secure_url?: string; message?: string; error?: { message?: string } } | null
  if (!res.ok || !json?.secure_url) throw new Error(json?.message ?? json?.error?.message ?? `Upload failed (${res.status})`)
  return json.secure_url
}

export function ImageUploader({
  id,
  label,
  hint,
  purpose,
  value,
  onChange,
  max,
  error,
  disabled,
  name,
}: {
  id: string
  label: string
  hint?: string
  purpose: UploadPurpose
  value: string[]
  onChange: (urls: string[]) => void
  max: number
  error?: string | null
  disabled?: boolean
  /** When set, hidden inputs carry the URLs in a plain <form>. */
  name?: string
}) {
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState("")
  const [problems, setProblems] = useState<string[]>([])
  const [dragging, setDragging] = useState(false)
  const statusId = useId()
  const remaining = max - value.length

  async function onFiles(files: FileList | null) {
    if (!files?.length) return
    const list = Array.from(files).slice(0, Math.max(remaining, max === 1 ? 1 : 0))
    const errs: string[] = []
    if (files.length > list.length) errs.push(`You can add ${remaining} more photo${remaining === 1 ? "" : "s"}.`)
    const valid = list.filter((f) => {
      const check = validateUploadFile(f)
      if (!check.ok) errs.push(check.message)
      return check.ok
    })
    setProblems(errs)
    if (!valid.length) return
    setBusy(true)
    let urls = max === 1 ? [] : [...value]
    for (const [i, f] of valid.entries()) {
      setStatus(`Uploading ${i + 1} of ${valid.length}…`)
      try {
        urls = [...urls, await uploadFile(f, purpose)]
        onChange(urls)
      } catch (e) {
        errs.push(`${f.name}: ${e instanceof Error ? e.message : "upload failed"}`)
        setProblems([...errs])
      }
    }
    setBusy(false)
    setStatus(errs.length ? "Some uploads failed." : `Uploaded ${valid.length} photo${valid.length === 1 ? "" : "s"}.`)
  }

  function move(i: number, d: -1 | 1) {
    const next = [...value]
    const j = i + d
    if (j < 0 || j >= next.length) return
    ;[next[i], next[j]] = [next[j]!, next[i]!]
    onChange(next)
  }

  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null, statusId].filter(Boolean).join(" ")
  return (
    <div className="v-field" id={`${id}-group`}>
      <label className="v-label" htmlFor={id}>
        {label}
      </label>
      {hint ? (
        <span className="v-hint" id={`${id}-hint`}>
          {hint}
        </span>
      ) : null}
      {value.length ? (
        <ul className="v-thumbs" aria-label={`${label}: ${value.length} uploaded`}>
          {value.map((url, i) => (
            <li key={url} className="v-thumb">
              <Image src={url} alt={`${label} ${i + 1}${i === 0 && max > 1 ? " (main photo)" : ""}`} width={280} height={373} unoptimized />
              <div className="v-thumb__actions">
                {max > 1 ? (
                  <>
                    <button type="button" className="h-btn h-btn--secondary" onClick={() => move(i, -1)} disabled={disabled || i === 0} aria-label={`Move photo ${i + 1} earlier`}>
                      ←
                    </button>
                    <button type="button" className="h-btn h-btn--secondary" onClick={() => move(i, 1)} disabled={disabled || i === value.length - 1} aria-label={`Move photo ${i + 1} later`}>
                      →
                    </button>
                  </>
                ) : null}
                <button type="button" className="h-btn v-btn-danger" onClick={() => onChange(value.filter((u) => u !== url))} disabled={disabled} aria-label={`Remove photo ${i + 1}`}>
                  Remove
                </button>
              </div>
              {name ? <input type="hidden" name={name} value={url} /> : null}
            </li>
          ))}
        </ul>
      ) : name ? (
        <input type="hidden" name={name} value="" />
      ) : null}
      {remaining > 0 || max === 1 ? (
        // Drop zone: the real file input stays in the tab order (visually hidden); the tile is its visual label.
        <div
          className={`v-drop ${dragging ? "is-dragging" : ""} ${disabled || busy ? "is-disabled" : ""}`}
          onDragOver={(e) => {
            if (disabled || busy) return
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            if (!disabled && !busy) void onFiles(e.dataTransfer.files)
          }}
        >
          <input
            id={id}
            type="file"
            className="v-drop__input"
            accept={ACCEPTED_IMAGE_TYPES.join(",")}
            multiple={max > 1}
            disabled={disabled || busy}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            data-testid={`${id}-input`}
            onChange={(e) => {
              void onFiles(e.currentTarget.files)
              e.currentTarget.value = ""
            }}
          />
          <label htmlFor={id} className="v-drop__tile" aria-hidden="true">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="16" />
              <circle cx="9" cy="10" r="2" />
              <path d="M21 16l-5-5-8 9" />
            </svg>
            <span className="v-drop__title">{busy ? status || "Uploading…" : value.length && max === 1 ? "Replace photo" : max > 1 ? "Add photos" : "Choose a photo"}</span>
            <span className="v-drop__sub">or drag {max > 1 ? "them" : "it"} here</span>
          </label>
        </div>
      ) : (
        <p className="v-hint" id={id}>
          You&apos;ve added the maximum of {max} photos.
        </p>
      )}
      <span id={statusId} className="v-hint" role="status" aria-live="polite">
        {status}
      </span>
      {problems.length ? (
        <ul className="v-error" aria-live="assertive">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      ) : null}
      {error ? (
        <span className="v-error" id={`${id}-error`}>
          {error}
        </span>
      ) : null}
    </div>
  )
}
