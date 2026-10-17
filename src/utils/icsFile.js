// Getting a built .ics file off the page. On an iPhone, opening the download
// offers "Add All" straight into Apple Calendar; the share sheet is there for
// sending the file somewhere else (AirDrop, Messages, another calendar app).

const ICS_TYPE = 'text/calendar';

export function canShareIcs(filename) {
  if (typeof navigator === 'undefined' || !navigator.canShare) return false;
  try {
    return navigator.canShare({ files: [new File([''], filename, { type: ICS_TYPE })] });
  } catch {
    return false;
  }
}

export function downloadIcs(text, filename) {
  const blob = new Blob([text], { type: `${ICS_TYPE};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Resolves true once shared, false if the share sheet was dismissed. */
export async function shareIcs(text, filename, title) {
  const file = new File([text], filename, { type: ICS_TYPE });
  try {
    await navigator.share({ files: [file], title });
    return true;
  } catch {
    return false;
  }
}
