export function Stat({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div className="v-stat" data-testid={testId}>
      <p className="v-stat__label">{label}</p>
      <p className="v-stat__value">{value}</p>
    </div>
  )
}
