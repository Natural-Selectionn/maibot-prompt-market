/** Trigger a UTF-8 file download without going through the clipboard. */
export function downloadText(content: string, filename: string, mimeType = "text/plain;charset=utf-8"): void {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.hidden = true;
    document.body.appendChild(link);
    try { link.click(); }
    finally { link.remove(); }
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
