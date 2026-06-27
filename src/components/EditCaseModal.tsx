import React, { useState, useEffect } from 'react';
import { X, BookOpen, Link, AlertCircle } from 'lucide-react';

interface EditCaseModalProps {
  isOpen: boolean;
  isEditing: boolean;
  initialTitle?: string;
  initialUrl?: string;
  initialSubcategory?: string;
  availableSubcategories: string[];
  onClose: () => void;
  onSave: (title: string, url: string, subcategory?: string) => void;
}

export default function EditCaseModal({
  isOpen,
  isEditing,
  initialTitle = '',
  initialUrl = '',
  initialSubcategory = '',
  availableSubcategories = [],
  onClose,
  onSave,
}: EditCaseModalProps) {
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [selectedSub, setSelectedSub] = useState('');
  const [newSubName, setNewSubName] = useState('');
  const [showNewSubInput, setShowNewSubInput] = useState(false);
  const [error, setError] = useState('');

  // Sync state with open transitions
  useEffect(() => {
    if (isOpen) {
      setTitle(initialTitle);
      setUrl(initialUrl || 'https://');
      setError('');
      
      if (initialSubcategory) {
        setSelectedSub(initialSubcategory);
        setShowNewSubInput(false);
        setNewSubName('');
      } else {
        setSelectedSub('');
        setShowNewSubInput(false);
        setNewSubName('');
      }
    }
  }, [isOpen, initialTitle, initialUrl, initialSubcategory]);

  if (!isOpen) return null;

  const handleSubcategoryChange = (val: string) => {
    setSelectedSub(val);
    if (val === '__new__') {
      setShowNewSubInput(true);
    } else {
      setShowNewSubInput(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!title.trim()) {
      setError('Please provide a descriptive case title.');
      return;
    }

    let formattedUrl = url.trim();
    if (!formattedUrl || formattedUrl === 'https://') {
      setError('Please provide a valid medical study or clinical case URL link.');
      return;
    }

    // Auto-fix protocol if missing
    if (!/^https?:\/\//i.test(formattedUrl)) {
      formattedUrl = 'https://' + formattedUrl;
    }

    try {
      new URL(formattedUrl);
    } catch (_) {
      setError('Please provide a valid, well-formed URL link.');
      return;
    }

    let subName: string | undefined = undefined;
    if (showNewSubInput) {
      if (!newSubName.trim()) {
        setError('Please enter a name for the new subcategory.');
        return;
      }
      subName = newSubName.trim();
    } else if (selectedSub && selectedSub !== '') {
      subName = selectedSub;
    }

    onSave(title.trim(), formattedUrl, subName);
  };

  return (
    <div id="case-modal-overlay" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div 
        id="case-modal-container" 
        className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900 transition-all transform scale-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 dark:border-slate-800">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white font-display flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-blue-500" />
            {isEditing ? '✏️ Edit Case details' : '➕ Add Clinical Case Study'}
          </h3>
          <button 
            id="close-case-modal-btn"
            onClick={onClose} 
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-850 dark:hover:text-slate-200 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-xs text-red-600 dark:bg-red-950/20 dark:text-red-400 border border-red-100 dark:border-red-950/40">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label htmlFor="case-title" className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
              Case Title / Descriptor
            </label>
            <input
              id="case-title"
              type="text"
              required
              placeholder="e.g., ACL tear with segond fracture"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none dark:border-slate-750 dark:bg-slate-850 dark:text-white dark:placeholder:text-slate-500 dark:focus:bg-slate-900 dark:focus:ring-blue-950/50 transition duration-150"
            />
          </div>

          <div>
            <label htmlFor="case-subcategory" className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
              Subcategory
            </label>
            <select
              id="case-subcategory"
              value={selectedSub}
              onChange={(e) => handleSubcategoryChange(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none dark:border-slate-750 dark:bg-slate-850 dark:text-white dark:focus:bg-slate-900 dark:focus:ring-blue-950/50 transition duration-150"
            >
              <option value="">None (Uncategorized / General)</option>
              {availableSubcategories.map((sub, i) => (
                <option key={i} value={sub}>{sub}</option>
              ))}
              <option value="__new__">➕ Create New Subcategory...</option>
            </select>
          </div>

          {showNewSubInput && (
            <div className="animate-fade-in">
              <label htmlFor="new-subcategory-name" className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                New Subcategory Name
              </label>
              <input
                id="new-subcategory-name"
                type="text"
                placeholder="e.g., Knee or Spine"
                value={newSubName}
                onChange={(e) => setNewSubName(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none dark:border-slate-750 dark:bg-slate-850 dark:text-white dark:placeholder:text-slate-500 dark:focus:bg-slate-900 dark:focus:ring-blue-950/50 transition duration-150"
              />
            </div>
          )}

          <div>
            <label htmlFor="case-url" className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5 flex items-center gap-1">
              <Link className="h-3.5 w-3.5 text-blue-500" />
              Clinical Case Link / Study URL
            </label>
            <input
              id="case-url"
              type="text"
              required
              placeholder="e.g., https://radiopaedia.org/cases/..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none dark:border-slate-750 dark:bg-slate-850 dark:text-white dark:placeholder:text-slate-500 dark:focus:bg-slate-900 dark:focus:ring-blue-950/50 transition duration-150"
            />
            <p className="mt-1.5 text-[11px] text-slate-400 dark:text-slate-500">
              Tip: Copy the web link directly from your tab. Protocol is auto-corrected.
            </p>
          </div>

          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-end space-x-3">
            <button
              id="cancel-case-btn"
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-750 dark:bg-slate-850 dark:text-slate-300 dark:hover:bg-slate-800 transition"
            >
              Cancel
            </button>
            <button
              id="save-case-btn"
              type="submit"
              className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 active:bg-blue-800 dark:bg-blue-500 dark:hover:bg-blue-600 transition shadow-lg shadow-blue-500/10"
            >
              {isEditing ? 'Save Changes' : 'Create Case'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
