export const CASE_STATUSES = [
  { value: "submitted", label: "Submitted" },
  { value: "allocated", label: "Allocated" },
  { value: "in_progress", label: "In progress" },
  { value: "information_required", label: "Information required" },
  { value: "final_stages", label: "Final stages" },
  { value: "closed", label: "Closed" },
] as const;

export function statusLabel(status: string) {
  return CASE_STATUSES.find((s) => s.value === status)?.label || status.replace(/_/g, " ");
}
