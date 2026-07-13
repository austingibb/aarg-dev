/* Tiny display formatters shared across pages. Lives outside the component
 * files so fast refresh keeps working (component files export only components). */

export function fmtSize(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} B`
}
