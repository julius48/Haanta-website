import type { SizeChartRow } from "./types"

export interface SizeChartData {
  name: string
  unit: string
  rows: SizeChartRow[]
  notes?: string | null
}

/**
 * Haanta standard size guide (body measurements in inches). Shown on every product page; when the
 * designer has uploaded their own chart, theirs is shown first and this one follows as a reference.
 */
export const STANDARD_SIZE_CHARTS: SizeChartData[] = [
  {
    name: "Women",
    unit: "in",
    rows: [
      { label: "XS", us: "0–2", uk: "4–6", measurements: { bust: "31–32", waist: "24–25", hips: "34–35" } },
      { label: "S", us: "4–6", uk: "8–10", measurements: { bust: "33–34", waist: "26–27", hips: "36–37" } },
      { label: "M", us: "8–10", uk: "12–14", measurements: { bust: "35–37", waist: "28–30", hips: "38–40" } },
      { label: "L", us: "12–14", uk: "16–18", measurements: { bust: "38–40", waist: "31–33", hips: "41–43" } },
      { label: "XL", us: "16–18", uk: "20–22", measurements: { bust: "41–43", waist: "34–36", hips: "44–46" } },
      { label: "2XL", us: "20–22", uk: "24–26", measurements: { bust: "44–47", waist: "37–40", hips: "47–50" } },
      { label: "3XL", us: "24–26", uk: "28–30", measurements: { bust: "48–51", waist: "41–44", hips: "51–54" } },
    ],
  },
  {
    name: "Men",
    unit: "in",
    rows: [
      { label: "S", us: "34–36", uk: "34–36", measurements: { chest: "34–36", waist: "28–30", hips: "35–37" } },
      { label: "M", us: "38–40", uk: "38–40", measurements: { chest: "38–40", waist: "31–33", hips: "38–40" } },
      { label: "L", us: "42–44", uk: "42–44", measurements: { chest: "42–44", waist: "34–36", hips: "41–43" } },
      { label: "XL", us: "46–48", uk: "46–48", measurements: { chest: "46–48", waist: "37–39", hips: "44–46" } },
      { label: "2XL", us: "50–52", uk: "50–52", measurements: { chest: "50–52", waist: "40–43", hips: "47–49" } },
      { label: "3XL", us: "54–56", uk: "54–56", measurements: { chest: "54–56", waist: "44–47", hips: "50–52" } },
    ],
  },
]

export const HOW_TO_MEASURE: { part: string; how: string }[] = [
  { part: "Bust / chest", how: "Around the fullest part, keeping the tape level under your arms." },
  { part: "Waist", how: "Around your natural waist, the narrowest part of your torso." },
  { part: "Hips", how: "Around the fullest part of your hips, feet together." },
  { part: "Shoulder width", how: "Across your back from one shoulder point to the other." },
  { part: "Arm length", how: "From the shoulder point down to your wrist bone, arm relaxed." },
  { part: "Inseam", how: "From the top of your inner thigh down to your ankle." },
]
