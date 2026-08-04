import { useState, useMemo, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import {
  FileText, Image, File, ExternalLink, Search, Receipt, TrendingUp,
  ShoppingBag, ChevronDown, ChevronUp, Plus, Trash2, Pencil, X,
  Camera, Upload, AlertTriangle, Clock, FolderOpen, Tag, Calendar,
  Check, Filter, ScanLine, ClipboardList,
} from 'lucide-react';
import { fileCategory, formatFileSize, uploadFile, deleteFile } from '../utils/storageUtils';

const DOC_TYPES = [
  { value: 'insurance', label: 'Insurance', color: '#6366f1' },
  { value: 'tax', label: 'Tax', color: '#f59e0b' },
  { value: 'medical', label: 'Medical', color: '#ef4444' },
  { value: 'vehicle', label: 'Vehicle', color: '#3b82f6' },
  { value: 'home', label: 'Home', color: '#10b981' },
  { value: 'financial', label: 'Financial', color: '#8b5cf6' },
  { value: 'work', label: 'Work', color: '#ec4899' },
  { value: 'legal', label: 'Legal', color: '#f97316' },
  { value: 'other', label: 'Other', color: '#6b7280' },
];

function getTypeInfo(value) {
  return DOC_TYPES.find((t) => t.value === value) || DOC_TYPES[DOC_TYPES.length - 1];
}

function FileIcon({ type, size = 16 }) {
  const cat = fileCategory(type || '');
  if (cat === 'image') return <Image size={size} style={{ color: '#10b981' }} />;
  if (cat === 'pdf') return <FileText size={size} style={{ color: '#f43f5e' }} />;
  if (cat === 'doc') return <FileText size={size} style={{ color: '#6366f1' }} />;
  return <File size={size} style={{ color: 'var(--muted)' }} />;
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + 'T12:00:00');
  return Math.round((target - today) / 86400000);
}

function ExpiryBadge({ date, label = 'Expires' }) {
  if (!date) return null;
  const days = daysUntil(date);
  if (days === null) return null;
  if (days < 0) {
    return (
      <span style={{ fontSize: '0.6875rem', fontWeight: '700', padding: '0.125rem 0.4rem', borderRadius: '0.375rem', backgroundColor: 'rgba(239,68,68,0.12)', color: 'var(--danger)', border: '1px solid rgba(239,68,68,0.2)' }}>
        Expired {Math.abs(days)}d ago
      </span>
    );
  }
  if (days <= 30) {
    return (
      <span style={{ fontSize: '0.6875rem', fontWeight: '700', padding: '0.125rem 0.4rem', borderRadius: '0.375rem', backgroundColor: 'rgba(245,158,11,0.12)', color: 'var(--warn)', border: '1px solid rgba(245,158,11,0.2)' }}>
        {label} in {days}d
      </span>
    );
  }
  return (
    <span style={{ fontSize: '0.6875rem', color: 'var(--subtle)', padding: '0.125rem 0.4rem', borderRadius: '0.375rem', backgroundColor: 'var(--surface2)', border: '1px solid var(--border)' }}>
      {label} {new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
    </span>
  );
}

function VaultDocCard({ doc, onEdit, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const typeInfo = getTypeInfo(doc.docType);
  const expiryDays = daysUntil(doc.expiryDate);
  const reviewDays = daysUntil(doc.reviewDate);
  const isExpired = expiryDays !== null && expiryDays < 0;
  const expiringOrReview = (expiryDays !== null && expiryDays >= 0 && expiryDays <= 30) ||
    (reviewDays !== null && reviewDays >= 0 && reviewDays <= 30);

  return (
    <div style={{
      backgroundColor: 'var(--surface)', border: `1px solid ${isExpired ? 'var(--danger)' : expiringOrReview ? 'rgba(245,158,11,0.4)' : 'var(--border)'}`,
      borderRadius: '1rem', overflow: 'hidden', marginBottom: '0.5rem',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.875rem 1rem' }}>
        <div style={{ width: '2.5rem', height: '2.5rem', borderRadius: '0.625rem', backgroundColor: `${typeInfo.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: `1px solid ${typeInfo.color}30` }}>
          {doc.attachment ? <FileIcon type={doc.attachment.type} size={18} /> : <FolderOpen size={18} style={{ color: typeInfo.color }} />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.2rem' }}>
            <p style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '12rem' }}>{doc.title}</p>
            <span style={{ fontSize: '0.6875rem', fontWeight: '700', padding: '0.125rem 0.4rem', borderRadius: '0.375rem', backgroundColor: `${typeInfo.color}20`, color: typeInfo.color, flexShrink: 0 }}>{typeInfo.label}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', flexWrap: 'wrap' }}>
            {doc.expiryDate && <ExpiryBadge date={doc.expiryDate} label="Expires" />}
            {doc.reviewDate && <ExpiryBadge date={doc.reviewDate} label="Review" />}
            {!doc.expiryDate && !doc.reviewDate && (
              <span style={{ fontSize: '0.75rem', color: 'var(--subtle)' }}>
                Added {new Date(doc.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', flexShrink: 0 }}>
          {doc.attachment && (
            <a href={doc.attachment.url} target="_blank" rel="noopener noreferrer"
              style={{ color: 'var(--accent-text)', display: 'flex', padding: '0.375rem', borderRadius: '0.5rem', background: 'none', border: 'none' }}>
              <ExternalLink size={15} />
            </a>
          )}
          <button onClick={() => setExpanded(!expanded)}
            style={{ color: 'var(--subtle)', background: 'none', border: 'none', cursor: 'pointer', padding: '0.375rem', borderRadius: '0.5rem', display: 'flex' }}>
            {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
        </div>
      </div>

      {expanded && (
        <div style={{ padding: '0 1rem 1rem', borderTop: '1px solid var(--border)' }}>
          {doc.description && (
            <p style={{ fontSize: '0.8125rem', color: 'var(--muted)', marginTop: '0.625rem', marginBottom: '0.5rem' }}>{doc.description}</p>
          )}
          {doc.attachment && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', backgroundColor: 'var(--surface2)', borderRadius: '0.75rem', padding: '0.625rem 0.75rem', marginTop: '0.5rem', marginBottom: '0.5rem' }}>
              <FileIcon type={doc.attachment.type} size={14} />
              <span style={{ fontSize: '0.8125rem', color: 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.attachment.name}</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--subtle)', flexShrink: 0 }}>{formatFileSize(doc.attachment.size)}</span>
            </div>
          )}
          {doc.ocrText && (
            <div style={{ marginTop: '0.5rem' }}>
              <p style={{ fontSize: '0.6875rem', color: 'var(--subtle)', marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Scanned Text</p>
              <p style={{ fontSize: '0.75rem', color: 'var(--muted)', backgroundColor: 'var(--surface2)', borderRadius: '0.625rem', padding: '0.5rem 0.625rem', maxHeight: '6rem', overflow: 'auto', whiteSpace: 'pre-wrap' }}>{doc.ocrText}</p>
            </div>
          )}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
            <button onClick={() => onEdit(doc)}
              style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', padding: '0.4rem 0.75rem', fontSize: '0.8125rem', fontWeight: '600', color: 'var(--accent-text)', backgroundColor: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: '0.625rem', cursor: 'pointer' }}>
              <Pencil size={13} /> Edit
            </button>
            <button onClick={() => onDelete(doc)}
              style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', padding: '0.4rem 0.75rem', fontSize: '0.8125rem', fontWeight: '600', color: 'var(--danger)', backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '0.625rem', cursor: 'pointer' }}>
              <Trash2 size={13} /> Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function AddDocModal({ doc, uid, onSave, onClose }) {
  const [title, setTitle] = useState(doc?.title || '');
  const [docType, setDocType] = useState(doc?.docType || 'other');
  const [description, setDescription] = useState(doc?.description || '');
  const [expiryDate, setExpiryDate] = useState(doc?.expiryDate || '');
  const [reviewDate, setReviewDate] = useState(doc?.reviewDate || '');
  const [attachment, setAttachment] = useState(doc?.attachment || null);
  const [ocrText, setOcrText] = useState(doc?.ocrText || '');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [error, setError] = useState('');
  const fileRef = useRef();
  const scanRef = useRef();

  const handleFileUpload = async (files) => {
    if (!files?.length) return;
    const file = files[0];
    setError('');
    setUploading(true);
    setUploadProgress(0);
    try {
      const att = await uploadFile(`users/${uid}/vault`, file, setUploadProgress);
      setAttachment(att);
    } catch (err) {
      setError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
      setUploadProgress(0);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleOCRScan = async (files) => {
    if (!files?.length) return;
    const file = files[0];
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
      setOcrText(text.trim());
      if (!title) {
        const firstLine = text.trim().split('\n')[0].trim();
        if (firstLine && firstLine.length < 80) setTitle(firstLine);
      }
      // Also upload the scanned image as attachment
      if (!attachment) {
        setUploading(true);
        try {
          const att = await uploadFile(`users/${uid}/vault`, file, setUploadProgress);
          setAttachment(att);
        } catch { /* ignore upload error after OCR */ }
        setUploading(false);
      }
    } catch (err) {
      setError('OCR failed: ' + (err.message || 'Unknown error'));
    } finally {
      setScanning(false);
      setScanProgress(0);
      if (scanRef.current) scanRef.current.value = '';
    }
  };

  const handleRemoveAttachment = async () => {
    if (!attachment) return;
    try { await deleteFile(attachment.url); } catch { /* ignore */ }
    setAttachment(null);
  };

  const handleSave = () => {
    if (!title.trim()) { setError('Title is required'); return; }
    onSave({
      title: title.trim(),
      docType,
      description: description.trim(),
      expiryDate: expiryDate || null,
      reviewDate: reviewDate || null,
      attachment: attachment || null,
      ocrText: ocrText || null,
    });
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{ backgroundColor: 'var(--surface)', borderRadius: '1.5rem 1.5rem 0 0', padding: '1.5rem 1rem', width: '100%', maxWidth: '480px', maxHeight: '90svh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <h2 style={{ fontSize: '1.125rem', fontWeight: '800', color: 'var(--text)' }}>{doc ? 'Edit Document' : 'Add Document'}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--subtle)', display: 'flex', padding: '0.25rem' }}>
            <X size={20} />
          </button>
        </div>

        {/* Title */}
        <label style={{ display: 'block', marginBottom: '0.75rem' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--subtle)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Title *</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Car Insurance Policy"
            style={{ display: 'block', width: '100%', marginTop: '0.375rem', padding: '0.625rem 0.875rem', backgroundColor: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '0.75rem', fontSize: '0.9375rem', color: 'var(--text)', outline: 'none', boxSizing: 'border-box' }} />
        </label>

        {/* Type */}
        <label style={{ display: 'block', marginBottom: '0.75rem' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--subtle)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Category</span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.375rem', marginTop: '0.375rem' }}>
            {DOC_TYPES.map((t) => (
              <button key={t.value} onClick={() => setDocType(t.value)}
                style={{ padding: '0.5rem', borderRadius: '0.625rem', fontSize: '0.8125rem', fontWeight: '600', cursor: 'pointer', border: `1.5px solid ${docType === t.value ? t.color : 'var(--border)'}`, backgroundColor: docType === t.value ? `${t.color}20` : 'var(--surface2)', color: docType === t.value ? t.color : 'var(--muted)', transition: 'all 0.15s' }}>
                {t.label}
              </button>
            ))}
          </div>
        </label>

        {/* Description */}
        <label style={{ display: 'block', marginBottom: '0.75rem' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--subtle)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Notes</span>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional notes…" rows={2}
            style={{ display: 'block', width: '100%', marginTop: '0.375rem', padding: '0.625rem 0.875rem', backgroundColor: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '0.75rem', fontSize: '0.9375rem', color: 'var(--text)', outline: 'none', resize: 'none', boxSizing: 'border-box' }} />
        </label>

        {/* Dates */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.625rem', marginBottom: '0.75rem' }}>
          <label style={{ display: 'block' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--subtle)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Expiry Date</span>
            <input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)}
              style={{ display: 'block', width: '100%', marginTop: '0.375rem', padding: '0.625rem 0.875rem', backgroundColor: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '0.75rem', fontSize: '0.875rem', color: 'var(--text)', outline: 'none', boxSizing: 'border-box' }} />
          </label>
          <label style={{ display: 'block' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--subtle)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Review Date</span>
            <input type="date" value={reviewDate} onChange={(e) => setReviewDate(e.target.value)}
              style={{ display: 'block', width: '100%', marginTop: '0.375rem', padding: '0.625rem 0.875rem', backgroundColor: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '0.75rem', fontSize: '0.875rem', color: 'var(--text)', outline: 'none', boxSizing: 'border-box' }} />
          </label>
        </div>

        {/* File attachment */}
        <div style={{ marginBottom: '0.75rem' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--subtle)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '0.5rem' }}>Attachment</span>
          {attachment ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', backgroundColor: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '0.75rem', padding: '0.625rem 0.875rem' }}>
              <FileIcon type={attachment.type} size={16} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{attachment.name}</p>
                <p style={{ fontSize: '0.6875rem', color: 'var(--subtle)' }}>{formatFileSize(attachment.size)}</p>
              </div>
              <a href={attachment.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-text)', display: 'flex' }}><ExternalLink size={14} /></a>
              <button onClick={handleRemoveAttachment} style={{ color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}><X size={14} /></button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              <button onClick={() => fileRef.current?.click()} disabled={uploading || scanning}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.375rem', padding: '0.75rem', borderRadius: '0.75rem', fontSize: '0.875rem', fontWeight: '600', backgroundColor: 'var(--surface2)', border: '1px dashed var(--border)', color: 'var(--muted)', cursor: uploading ? 'default' : 'pointer' }}>
                <Upload size={16} />
                {uploading ? `${uploadProgress}%` : 'Upload File'}
              </button>
              <button onClick={() => scanRef.current?.click()} disabled={uploading || scanning}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.375rem', padding: '0.75rem', borderRadius: '0.75rem', fontSize: '0.875rem', fontWeight: '600', backgroundColor: 'var(--surface2)', border: '1px dashed var(--border)', color: 'var(--accent-text)', cursor: scanning ? 'default' : 'pointer' }}>
                <ScanLine size={16} />
                {scanning ? `Scanning ${scanProgress}%` : 'OCR Scan'}
              </button>
            </div>
          )}
          {(uploading || scanning) && (
            <div style={{ height: '0.25rem', backgroundColor: 'var(--surface2)', borderRadius: '9999px', overflow: 'hidden', marginTop: '0.5rem' }}>
              <div style={{ height: '100%', backgroundColor: scanning ? 'var(--accent)' : '#10b981', borderRadius: '9999px', transition: 'width 0.2s', width: `${scanning ? scanProgress : uploadProgress}%` }} />
            </div>
          )}
          <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.doc,.docx" onChange={(e) => handleFileUpload(e.target.files)} style={{ display: 'none' }} />
          <input ref={scanRef} type="file" accept="image/*,.pdf" onChange={(e) => handleOCRScan(e.target.files)} style={{ display: 'none' }} capture="environment" />
        </div>

        {/* OCR text preview */}
        {ocrText && (
          <div style={{ marginBottom: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--subtle)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Scanned Text</span>
              <button onClick={() => setOcrText('')} style={{ fontSize: '0.75rem', color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer' }}>Clear</button>
            </div>
            <textarea value={ocrText} onChange={(e) => setOcrText(e.target.value)} rows={4}
              style={{ display: 'block', width: '100%', padding: '0.5rem 0.75rem', backgroundColor: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '0.625rem', fontSize: '0.75rem', color: 'var(--muted)', outline: 'none', resize: 'none', boxSizing: 'border-box', fontFamily: 'monospace' }} />
          </div>
        )}

        {error && (
          <p style={{ fontSize: '0.8125rem', color: 'var(--danger)', backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '0.625rem', padding: '0.5rem 0.75rem', marginBottom: '0.75rem' }}>{error}</p>
        )}

        <div style={{ display: 'flex', gap: '0.625rem' }}>
          <button onClick={onClose} style={{ flex: 1, padding: '0.75rem', borderRadius: '0.875rem', fontSize: '0.9375rem', fontWeight: '700', backgroundColor: 'var(--surface2)', color: 'var(--muted)', border: '1px solid var(--border)', cursor: 'pointer' }}>Cancel</button>
          <button onClick={handleSave} disabled={!title.trim() || uploading || scanning}
            style={{ flex: 2, padding: '0.75rem', borderRadius: '0.875rem', fontSize: '0.9375rem', fontWeight: '700', backgroundColor: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer', opacity: (!title.trim() || uploading || scanning) ? 0.5 : 1 }}>
            {doc ? 'Save Changes' : 'Add Document'}
          </button>
        </div>
      </div>
    </div>
  );
}

function AttachedSection({ icon: Icon, title, color, items }) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;
  return (
    <div style={{ marginBottom: '0.75rem' }}>
      <button onClick={() => setOpen(!open)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.625rem 0', background: 'none', border: 'none', cursor: 'pointer' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Icon size={14} style={{ color }} />
          <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{title}</span>
          <span style={{ fontSize: '0.75rem', color: 'var(--subtle)', backgroundColor: 'var(--surface2)', border: '1px solid var(--border)', padding: '0.125rem 0.5rem', borderRadius: '9999px' }}>{items.length}</span>
        </div>
        {open ? <ChevronUp size={15} style={{ color: 'var(--subtle)' }} /> : <ChevronDown size={15} style={{ color: 'var(--subtle)' }} />}
      </button>
      {open && (
        <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '1rem', overflow: 'hidden' }}>
          {items.map((item, i) => (
            <div key={item.att.id + i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.875rem 1rem', borderBottom: i < items.length - 1 ? '1px solid var(--border)' : 'none' }}>
              <div style={{ width: '2.25rem', height: '2.25rem', borderRadius: '0.625rem', backgroundColor: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <FileIcon type={item.att.type} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.att.name}</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.75rem', color: 'var(--subtle)' }}>
                  <span style={{ color }}>{item.source}</span>
                  <span>·</span>
                  <span>{formatFileSize(item.att.size)}</span>
                  {item.att.uploadedAt && <><span>·</span><span>{new Date(item.att.uploadedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span></>}
                </div>
              </div>
              <a href={item.att.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-text)', display: 'flex', padding: '0.375rem', flexShrink: 0 }}>
                <ExternalLink size={16} />
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DocumentVault() {
  const { bills, income, purchases, shoppingLists, shoppingItems, vaultDocuments, addVaultDocument, updateVaultDocument, deleteVaultDocument } = useApp();
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showAdd, setShowAdd] = useState(false);
  const [editDoc, setEditDoc] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [activeTab, setActiveTab] = useState('vault');

  const q = query.toLowerCase();

  const filteredVaultDocs = useMemo(() => {
    return vaultDocuments.filter((doc) => {
      if (filterType !== 'all' && doc.docType !== filterType) return false;
      if (filterStatus === 'expired') {
        const days = daysUntil(doc.expiryDate);
        if (days === null || days >= 0) return false;
      }
      if (filterStatus === 'expiring') {
        const expiryDays = daysUntil(doc.expiryDate);
        const reviewDays = daysUntil(doc.reviewDate);
        const expiringSoon = expiryDays !== null && expiryDays >= 0 && expiryDays <= 30;
        const reviewSoon = reviewDays !== null && reviewDays >= 0 && reviewDays <= 30;
        if (!expiringSoon && !reviewSoon) return false;
      }
      if (q) {
        const inTitle = doc.title.toLowerCase().includes(q);
        const inDesc = (doc.description || '').toLowerCase().includes(q);
        const inOcr = (doc.ocrText || '').toLowerCase().includes(q);
        const inType = getTypeInfo(doc.docType).label.toLowerCase().includes(q);
        if (!inTitle && !inDesc && !inOcr && !inType) return false;
      }
      return true;
    });
  }, [vaultDocuments, filterType, filterStatus, q]);

  const billDocs = useMemo(() => bills.flatMap((b) =>
    (b.attachments || []).map((att) => ({ att, source: b.name }))
  ).filter((i) => !q || i.att.name.toLowerCase().includes(q) || i.source.toLowerCase().includes(q)), [bills, q]);

  const incomeDocs = useMemo(() => income.flatMap((i) =>
    (i.attachments || []).map((att) => ({ att, source: i.source || i.name }))
  ).filter((i) => !q || i.att.name.toLowerCase().includes(q) || i.source.toLowerCase().includes(q)), [income, q]);

  const purchaseDocs = useMemo(() => purchases.flatMap((p) =>
    (p.attachments || []).map((att) => ({ att, source: p.merchant }))
  ).filter((i) => !q || i.att.name.toLowerCase().includes(q) || i.source.toLowerCase().includes(q)), [purchases, q]);

  // Files attached to a list, or to one of its items — the item's own list is
  // the useful label, since "Milk" on its own says nothing about where it came
  // from.
  const listDocs = useMemo(() => {
    const listName = (id) => shoppingLists.find((l) => l.id === id)?.name || 'List';
    return [
      ...shoppingLists.flatMap((l) => (l.attachments || []).map((att) => ({ att, source: l.name }))),
      ...shoppingItems.flatMap((i) => (i.attachments || []).map((att) => ({ att, source: `${listName(i.listId)} · ${i.name}` }))),
    ].filter((i) => !q || i.att.name.toLowerCase().includes(q) || i.source.toLowerCase().includes(q));
  }, [shoppingLists, shoppingItems, q]);

  const attachedCount = billDocs.length + incomeDocs.length + purchaseDocs.length + listDocs.length;

  const urgentDocs = vaultDocuments.filter((doc) => {
    const expiryDays = daysUntil(doc.expiryDate);
    const reviewDays = daysUntil(doc.reviewDate);
    return (expiryDays !== null && expiryDays <= 7) || (reviewDays !== null && reviewDays <= 7);
  });

  const handleSave = (data) => {
    if (editDoc) {
      updateVaultDocument(editDoc.id, data);
      setEditDoc(null);
    } else {
      addVaultDocument(data);
      setShowAdd(false);
    }
  };

  const handleDeleteConfirmed = async () => {
    if (!confirmDelete) return;
    if (confirmDelete.attachment?.url) {
      try { await deleteFile(confirmDelete.attachment.url); } catch { /* ignore */ }
    }
    deleteVaultDocument(confirmDelete.id);
    setConfirmDelete(null);
  };

  return (
    <div className="app-page">
      <div className="app-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.875rem' }}>
          <h1 style={{ fontSize: '1.625rem', fontWeight: 900, color: 'var(--text)', letterSpacing: '-0.02em' }}>Document Vault</h1>
          <button onClick={() => setShowAdd(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', padding: '0.5rem 0.875rem', backgroundColor: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '0.75rem', fontSize: '0.875rem', fontWeight: '700', cursor: 'pointer' }}>
            <Plus size={15} /> Add
          </button>
        </div>

        {/* Search */}
        <div style={{ position: 'relative', marginBottom: '0.625rem' }}>
          <Search size={15} style={{ position: 'absolute', left: '0.875rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--subtle)', pointerEvents: 'none' }} />
          <input type="text" placeholder="Search documents…" value={query} onChange={(e) => setQuery(e.target.value)}
            style={{ width: '100%', paddingLeft: '2.5rem', paddingRight: query ? '2.5rem' : '1rem', paddingTop: '0.625rem', paddingBottom: '0.625rem', backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '0.875rem', fontSize: '0.9375rem', color: 'var(--text)', outline: 'none', boxSizing: 'border-box' }} />
          {query && (
            <button onClick={() => setQuery('')} style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--subtle)', cursor: 'pointer', display: 'flex' }}>
              <X size={15} />
            </button>
          )}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', backgroundColor: 'var(--surface2)', borderRadius: '0.875rem', padding: '0.25rem', gap: '0.25rem' }}>
          {[['vault', `Vault (${vaultDocuments.length})`], ['attached', `Attached (${attachedCount})`]].map(([tab, label]) => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              style={{ flex: 1, padding: '0.5rem', borderRadius: '0.625rem', fontSize: '0.8125rem', fontWeight: 700, border: 'none', cursor: 'pointer', transition: 'all 0.15s',
                backgroundColor: activeTab === tab ? 'var(--accent)' : 'transparent',
                color: activeTab === tab ? '#fff' : 'var(--subtle)' }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: '0 1rem' }}>
        {activeTab === 'vault' && (
          <>
            {/* Urgent alerts */}
            {urgentDocs.length > 0 && (
              <div style={{ backgroundColor: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: '1rem', padding: '0.875rem 1rem', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <AlertTriangle size={14} style={{ color: 'var(--warn)' }} />
                  <span style={{ fontSize: '0.8125rem', fontWeight: '700', color: 'var(--warn)' }}>Action Needed</span>
                </div>
                {urgentDocs.map((doc) => {
                  const expiryDays = daysUntil(doc.expiryDate);
                  const reviewDays = daysUntil(doc.reviewDate);
                  return (
                    <div key={doc.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8125rem', padding: '0.2rem 0' }}>
                      <span style={{ color: 'var(--text)' }}>{doc.title}</span>
                      <div style={{ display: 'flex', gap: '0.25rem' }}>
                        {expiryDays !== null && expiryDays <= 7 && <ExpiryBadge date={doc.expiryDate} label="Expires" />}
                        {reviewDays !== null && reviewDays <= 7 && <ExpiryBadge date={doc.reviewDate} label="Review" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Filters */}
            <div style={{ display: 'flex', gap: '0.375rem', overflowX: 'auto', paddingBottom: '0.25rem', marginBottom: '1rem' }}>
              {[['all', 'All'], ['expiring', 'Expiring Soon'], ['expired', 'Expired']].map(([val, lbl]) => (
                <button key={val} onClick={() => setFilterStatus(val)}
                  style={{ flexShrink: 0, padding: '0.375rem 0.75rem', borderRadius: '9999px', fontSize: '0.8125rem', fontWeight: '600', cursor: 'pointer', border: '1px solid', transition: 'all 0.15s',
                    backgroundColor: filterStatus === val ? (val === 'expired' ? 'rgba(239,68,68,0.15)' : val === 'expiring' ? 'rgba(245,158,11,0.15)' : 'rgba(99,102,241,0.15)') : 'var(--surface2)',
                    borderColor: filterStatus === val ? (val === 'expired' ? 'var(--danger)' : val === 'expiring' ? 'var(--warn)' : 'var(--accent)') : 'var(--border)',
                    color: filterStatus === val ? (val === 'expired' ? 'var(--danger)' : val === 'expiring' ? 'var(--warn)' : 'var(--accent-text)') : 'var(--muted)' }}>
                  {lbl}
                </button>
              ))}
              <div style={{ width: '1px', backgroundColor: 'var(--border)', flexShrink: 0, margin: '0 0.125rem' }} />
              {DOC_TYPES.map((t) => (
                <button key={t.value} onClick={() => setFilterType(filterType === t.value ? 'all' : t.value)}
                  style={{ flexShrink: 0, padding: '0.375rem 0.75rem', borderRadius: '9999px', fontSize: '0.8125rem', fontWeight: '600', cursor: 'pointer', border: `1px solid ${filterType === t.value ? t.color : 'var(--border)'}`, backgroundColor: filterType === t.value ? `${t.color}20` : 'var(--surface2)', color: filterType === t.value ? t.color : 'var(--muted)', transition: 'all 0.15s' }}>
                  {t.label}
                </button>
              ))}
            </div>

            {filteredVaultDocs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
                <FolderOpen size={48} style={{ margin: '0 auto 1rem', opacity: 0.2, color: 'var(--muted)', display: 'block' }} />
                <p style={{ fontWeight: 700, color: 'var(--text)', fontSize: '1.125rem', marginBottom: '0.5rem' }}>
                  {vaultDocuments.length === 0 ? 'No documents yet' : 'No matches'}
                </p>
                <p style={{ fontSize: '0.9375rem', color: 'var(--muted)' }}>
                  {vaultDocuments.length === 0
                    ? 'Tap + Add to store insurance, tax, medical, and other important documents.'
                    : 'Try adjusting your search or filters.'}
                </p>
                {vaultDocuments.length === 0 && (
                  <button onClick={() => setShowAdd(true)}
                    style={{ marginTop: '1.25rem', display: 'inline-flex', alignItems: 'center', gap: '0.375rem', padding: '0.75rem 1.5rem', backgroundColor: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '0.875rem', fontSize: '0.9375rem', fontWeight: '700', cursor: 'pointer' }}>
                    <Plus size={16} /> Add First Document
                  </button>
                )}
              </div>
            ) : (
              <div>
                <p style={{ fontSize: '0.75rem', color: 'var(--subtle)', marginBottom: '0.75rem' }}>
                  {filteredVaultDocs.length} document{filteredVaultDocs.length !== 1 ? 's' : ''}
                  {(filterType !== 'all' || filterStatus !== 'all' || q) ? ' (filtered)' : ''}
                </p>
                {filteredVaultDocs.map((doc) => (
                  <VaultDocCard key={doc.id} doc={doc} onEdit={(d) => setEditDoc(d)} onDelete={(d) => setConfirmDelete(d)} />
                ))}
              </div>
            )}
          </>
        )}

        {activeTab === 'attached' && (
          <>
            {attachedCount === 0 ? (
              <div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
                <File size={48} style={{ margin: '0 auto 1rem', opacity: 0.2, color: 'var(--muted)', display: 'block' }} />
                <p style={{ fontWeight: 700, color: 'var(--text)', fontSize: '1.125rem', marginBottom: '0.5rem' }}>No attached files</p>
                <p style={{ fontSize: '0.9375rem', color: 'var(--muted)' }}>Tap the paperclip on any bill, income, purchase or list to upload receipts and documents.</p>
              </div>
            ) : (
              <>
                <p style={{ fontSize: '0.75rem', color: 'var(--subtle)', marginBottom: '1rem' }}>{attachedCount} file{attachedCount !== 1 ? 's' : ''} attached to transactions and lists</p>
                <AttachedSection icon={Receipt} title="Bill Receipts" color="#6366f1" items={billDocs} />
                <AttachedSection icon={TrendingUp} title="Income Documents" color="#10b981" items={incomeDocs} />
                <AttachedSection icon={ShoppingBag} title="Purchase Receipts" color="#f59e0b" items={purchaseDocs} />
                <AttachedSection icon={ClipboardList} title="List Attachments" color="#8b5cf6" items={listDocs} />
              </>
            )}
          </>
        )}
      </div>

      {/* Add / Edit modal */}
      {(showAdd || editDoc) && (
        <AddDocModal
          doc={editDoc}
          uid={user?.uid}
          onSave={handleSave}
          onClose={() => { setShowAdd(false); setEditDoc(null); }}
        />
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)', padding: '1rem' }}
          onClick={(e) => e.target === e.currentTarget && setConfirmDelete(null)}>
          <div style={{ backgroundColor: 'var(--surface)', borderRadius: '1.25rem', padding: '1.5rem', width: '100%', maxWidth: '360px' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: '800', color: 'var(--text)', marginBottom: '0.5rem' }}>Delete Document?</h3>
            <p style={{ fontSize: '0.875rem', color: 'var(--muted)', marginBottom: '1.25rem' }}>
              "{confirmDelete.title}" will be permanently deleted{confirmDelete.attachment ? ' along with its attached file' : ''}.
            </p>
            <div style={{ display: 'flex', gap: '0.625rem' }}>
              <button onClick={() => setConfirmDelete(null)}
                style={{ flex: 1, padding: '0.75rem', borderRadius: '0.875rem', fontSize: '0.9375rem', fontWeight: '700', backgroundColor: 'var(--surface2)', color: 'var(--muted)', border: '1px solid var(--border)', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleDeleteConfirmed}
                style={{ flex: 1, padding: '0.75rem', borderRadius: '0.875rem', fontSize: '0.9375rem', fontWeight: '700', backgroundColor: 'rgba(239,68,68,0.12)', color: 'var(--danger)', border: '1px solid rgba(239,68,68,0.2)', cursor: 'pointer' }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
