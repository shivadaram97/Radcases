import React, { useState, useEffect } from 'react';
import { X, FolderPlus } from 'lucide-react';

interface EditCategoryModalProps {
  isOpen: boolean;
  isEditing: boolean;
  initialName?: string;
  onClose: () => void;
  onSave: (name: string) => void;
}

export default function EditCategoryModal({
  isOpen,
  isEditing,
  initialName = '',
  onClose,
  onSave,
}: EditCategoryModalProps) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setName(initialName);
      setError('');
    }
  }, [isOpen, initialName]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Category name cannot be empty.');
      return;
    }
    onSave(name.trim());
  };

  return (
    <div id="category-modal-overlay" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div 
        id="category-modal-container" 
        className="w-full max-w-sm overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900 transition-all transform scale-100"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 dark:border-slate-800">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white font-display flex items-center gap-2">
            <FolderPlus className="h-5 w-5 text-blue-500" />
            {isEditing ? '✏️ Rename Category' : '📁 New Category'}
          </h3>
          <button 
            id="close-category-modal-btn"
            onClick={onClose} 
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-850 dark:hover:text-slate-200 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/20 p-2.5 rounded-lg border border-red-100 dark:border-red-950/40">
              {error}
            </p>
          )}

          <div>
            <label htmlFor="cat-name" className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5 animate-pulse">
              Category Name
            </label>
            <input
              id="cat-name"
              type="text"
              required
              placeholder="e.g., MSK cases, Pediatrics"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none dark:border-slate-750 dark:bg-slate-850 dark:text-white dark:placeholder:text-slate-500 dark:focus:bg-slate-900 dark:focus:ring-blue-950/50 transition duration-155"
              autoFocus
            />
          </div>

          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-end space-x-3">
            <button
              id="cancel-category-btn"
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-750 dark:bg-slate-850 dark:text-slate-300 dark:hover:bg-slate-800 transition"
            >
              Cancel
            </button>
            <button
              id="save-category-btn"
              type="submit"
              className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 active:bg-blue-800 dark:bg-blue-500 dark:hover:bg-blue-600 transition shadow-lg shadow-blue-500/10"
            >
              {isEditing ? 'Apply Rename' : 'Add Category'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
