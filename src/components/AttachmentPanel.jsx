import { useRef, useState } from 'react';
import {
  Upload, Camera, ScanLine, Trash2, ExternalLink, FileText, Image as ImageIcon,
  File, AlertCircle, ListPlus, Check,
} from 'lucide-react';
import { uploadFile, deleteFile, formatFileSize, fileCategory } from '../utils/storageUtils';
import { splitPastedLines } from '../utils/helpers';

const DEFAULT_ACCEPT = '.pdf,.jpg,.jpeg,.png,.gif,.webp,.heic,.doc,.docx';

function AttachmentIcon({ type }) {
  const cat = fileCategory(type || '');
  if (cat === 'image') return <ImageIcon size={16} style={{ color: '#10b981' }} />;
  if (cat === 'pdf') return <FileText size={16} style={{ color: '#f43f5e' }} />;
  if (cat === 'doc') return <FileText size={16} style={{ color: '#6366f1' }} />;
  return <File size={16} style={{ color: 'var(--muted)' }} />;
}

/** One of the three add buttons — file picker, camera, scanner. */
function AddButton({ Icon, label, busyLabel, busy, disabled, onClick, accent }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.375rem',
        padding: '0.6875rem 0.5rem', borderRadius: '0.75rem',
        fontSize: '0.8125rem', fontWeight: 600,
        backgroundColor: 'var(--surface2)', border: '1px dashed var(--border)',
        color: accent ? 'var(--accent-text)' : 'var(--muted)',
        cursor: disabled ? 'default' : 'pointer', opacity: disabled && !busy ? 0.5 : 1,
      }}
    >
      <Icon size={15} style={{ flexShrink: 0 }} />
      {busy ? busyLabel : label}
    </button>
  );
}

/**
 * Attachments, photos and photo-to-text scanning for one record.
 *
 * Files upload straight to Firebase Storage under `storagePath` and the parent
 * persists the returned array — there's no separate save step, so a photo taken
 * on a phone is safe the moment it finishes uploading.
 *
 * Scanning runs Tesseract on the picked image *before* it leaves the device, so
 * the OCR never depends on the file being publicly fetchable.
 *
 * Props:
 *   storagePath — Storage base path, e.g. "users/uid/lists/listId"
 *   attachments — current array of {id,name,url,type,size,uploadedAt}
 *   onChange    — called with the next attachments array
 *   ocrText     — scanned text held on the record
 *   onOcrText   — called with the edited/scanned text (omit to hide the box)
 *   onAddItems  — lists only: called with the scanned lines to add as items
 *   accept      — file input accept string
 *   hint        — one line of copy under the buttons
 */
export default function AttachmentPanel({
  storagePath,
  attachments = [],
  onChange,
  ocrText = '',
  onOcrText,
  onAddItems,
  accept = DEFAULT_ACCEPT,
  hint = 'Receipts, photos, screenshots or PDFs · max 10 MB each',
}) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(null);
  const [added, setAdded] = useState(0);
  const fileRef = useRef();
  const cameraRef = useRef();
  const scanRef = useRef();

  const busy = uploading || scanning;

  /** Upload every picked file, then hand the parent one new array. */
  const uploadAll = async (files) => {
    const uploaded = [];
    for (const file of files) {
      const att = await uploadFile(storagePath, file, setProgress);
      uploaded.push(att);
      setProgress(0);
    }
    if (uploaded.length > 0) onChange?.([...attachments, ...uploaded]);
    return uploaded;
  };

  const handleFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;
    setError('');
    setUploading(true);
    try {
      await uploadAll(files);
    } catch (err) {
      setError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
      setProgress(0);
      if (fileRef.current) fileRef.current.value = '';
      if (cameraRef.current) cameraRef.current.value = '';
    }
  };

  /** Read the text off a photo, then keep the photo as an attachment too. */
  const handleScan = async (fileList) => {
    const file = fileList?.[0];
    if (!file) return;
    setError('');
    setScanning(true);
    setScanProgress(0);
    try {
      const { createWorker } = await import('tesseract.js');
      const worker = await createWorker('eng', 1, {
        logger: (m) => {
          if (m.status === 'recognizing text') setScanProgress(Math.round(m.progress * 100));
        },
      });
      const { data: { text } } = await worker.recognize(file);
      await worker.terminate();
      const cleaned = String(text || '').trim();
      if (!cleaned) {
        setError("Couldn't read any text in that photo — try again with more light.");
      } else {
        onOcrText?.(ocrText ? `${ocrText}\n${cleaned}` : cleaned);
      }
    } catch (err) {
      setError('Scan failed: ' + (err.message || 'Unknown error'));
    } finally {
      setScanning(false);
      setScanProgress(0);
    }

    // Keep the scanned photo, so the original is there to re-read later.
    setUploading(true);
    try {
      await uploadAll([file]);
    } catch {
      // The text is already captured — a failed upload shouldn't lose it.
    } finally {
      setUploading(false);
      setProgress(0);
      if (scanRef.current) scanRef.current.value = '';
    }
  };

  const handleRemove = async (att) => {
    setDeleting(att.id);
    try {
      await deleteFile(att.url);
    } catch {
      // Already gone from Storage — drop it from the record either way.
    } finally {
      setDeleting(null);
      onChange?.(attachments.filter((a) => a.id !== att.id));
    }
  };

  const scannedLines = onAddItems ? splitPastedLines(ocrText) : [];

  const handleAddItems = () => {
    if (scannedLines.length === 0) return;
    onAddItems(scannedLines);
    setAdded(scannedLines.length);
    setTimeout(() => setAdded(0), 2500);
  };

  return (
    <div>
      {attachments.length > 0 && (
        <div style={{ marginBottom: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {attachments.map((att) => (
            <div key={att.id} style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', backgroundColor: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '0.75rem', padding: '0.5rem 0.75rem' }}>
              {fileCategory(att.type) === 'image' ? (
                <img
                  src={att.url}
                  alt={att.name}
                  style={{ width: '2.5rem', height: '2.5rem', objectFit: 'cover', borderRadius: '0.5rem', flexShrink: 0, border: '1px solid var(--border)' }}
                />
              ) : (
                <div style={{ width: '2.5rem', height: '2.5rem', borderRadius: '0.5rem', backgroundColor: 'var(--surface)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <AttachmentIcon type={att.type} />
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{att.name}</p>
                <p style={{ fontSize: '0.6875rem', color: 'var(--subtle)' }}>
                  {formatFileSize(att.size)}{att.uploadedAt ? ` · ${new Date(att.uploadedAt).toLocaleDateString()}` : ''}
                </p>
              </div>
              <a href={att.url} target="_blank" rel="noopener noreferrer" title="Open"
                style={{ color: 'var(--accent-text)', padding: '0.25rem', display: 'flex', flexShrink: 0 }}>
                <ExternalLink size={15} />
              </a>
              <button
                type="button"
                onClick={() => handleRemove(att)}
                disabled={deleting === att.id}
                title="Remove"
                style={{ color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem', display: 'flex', flexShrink: 0, opacity: deleting === att.id ? 0.5 : 1 }}>
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: onOcrText ? 'repeat(3, 1fr)' : 'repeat(2, 1fr)', gap: '0.5rem' }}>
        <AddButton Icon={Upload} label="File" busyLabel={`${progress}%`} busy={uploading && !scanning} disabled={busy} onClick={() => !busy && fileRef.current?.click()} />
        <AddButton Icon={Camera} label="Photo" busyLabel={`${progress}%`} busy={uploading && !scanning} disabled={busy} onClick={() => !busy && cameraRef.current?.click()} />
        {onOcrText && (
          <AddButton
            Icon={ScanLine} label="Scan" busyLabel={`${scanProgress}%`} busy={scanning} accent
            disabled={busy} onClick={() => !busy && scanRef.current?.click()}
          />
        )}
      </div>

      {busy && (
        <div style={{ height: '0.25rem', backgroundColor: 'var(--surface2)', borderRadius: '9999px', overflow: 'hidden', marginTop: '0.5rem' }}>
          <div style={{ height: '100%', width: `${scanning ? scanProgress : progress}%`, backgroundColor: scanning ? 'var(--accent)' : '#10b981', borderRadius: '9999px', transition: 'width 0.2s' }} />
        </div>
      )}

      <p style={{ fontSize: '0.6875rem', color: 'var(--subtle)', marginTop: '0.5rem' }}>
        {scanning ? 'Reading the text off that photo…' : hint}
      </p>

      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.625rem', backgroundColor: 'rgba(244,63,94,0.08)', border: '1px solid var(--danger)', borderRadius: '0.625rem', padding: '0.5rem 0.75rem' }}>
          <AlertCircle size={14} style={{ color: 'var(--danger)', flexShrink: 0 }} />
          <p style={{ fontSize: '0.8125rem', color: 'var(--danger)' }}>{error}</p>
        </div>
      )}

      {onOcrText && ocrText && (
        <div style={{ marginTop: '0.875rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.375rem' }}>
            <span className="app-label" style={{ marginBottom: 0 }}>Scanned text</span>
            <button type="button" onClick={() => onOcrText('')}
              style={{ fontSize: '0.75rem', color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer' }}>
              Clear
            </button>
          </div>
          <textarea
            className="app-input"
            value={ocrText}
            onChange={(e) => onOcrText(e.target.value)}
            rows={5}
            style={{ minHeight: '6rem', resize: 'vertical', fontSize: '0.8125rem', lineHeight: 1.6, fontFamily: 'inherit' }}
          />
          {onAddItems && (
            <>
              <p style={{ fontSize: '0.6875rem', color: 'var(--subtle)', marginTop: '0.375rem' }}>
                Fix anything the scan got wrong, then add each line as an item.
              </p>
              <button
                type="button"
                onClick={handleAddItems}
                disabled={scannedLines.length === 0}
                style={{
                  width: '100%', marginTop: '0.5rem', padding: '0.6875rem', borderRadius: '0.75rem',
                  border: 'none', cursor: scannedLines.length === 0 ? 'default' : 'pointer',
                  backgroundColor: scannedLines.length === 0 ? 'var(--surface2)' : 'var(--accent)',
                  color: scannedLines.length === 0 ? 'var(--subtle)' : '#fff',
                  fontSize: '0.875rem', fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                }}
              >
                {added > 0
                  ? <><Check size={16} /> Added {added} {added === 1 ? 'item' : 'items'}</>
                  : <><ListPlus size={16} /> Add {scannedLines.length} {scannedLines.length === 1 ? 'line' : 'lines'} as items</>}
              </button>
            </>
          )}
        </div>
      )}

      <input ref={fileRef} type="file" accept={accept} multiple onChange={(e) => handleFiles(e.target.files)} style={{ display: 'none' }} />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={(e) => handleFiles(e.target.files)} style={{ display: 'none' }} />
      <input ref={scanRef} type="file" accept="image/*" capture="environment" onChange={(e) => handleScan(e.target.files)} style={{ display: 'none' }} />
    </div>
  );
}
