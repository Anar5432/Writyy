import React, { useState, useEffect, useRef } from 'react';

const EMOJI_PALETTE = [
  '📝', '💡', '⚡', '🎯', '📖', '📌', '🌟', '✍️',
  '🧠', '💬', '🏆', '📚', '🚀', '🔍', '🎨', '🏛️',
  '🎓', '🧪', '🔑', '📑'
];

const NOTE_TAGS = [
  'IELTS',
  'Vocabulary',
  'Spelling',
  'Collocations',
  'Grammar',
  'Ideas',
  'General'
];

export default function NotesView({ 
  notes = [], 
  onSaveNote, 
  onDeleteNote, 
  onPinNote, 
  showToast, 
  currentUser 
}) {
  // Navigation State: 'list' | 'editor'
  const [viewMode, setViewMode] = useState('list');
  const [activeNoteId, setActiveNoteId] = useState(null);

  // Filter & Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTag, setFilterTag] = useState('ALL'); // 'ALL' | 'PINNED' | tag name
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  // Editor State
  const [editorTitle, setEditorTitle] = useState('');
  const [editorContent, setEditorContent] = useState('');
  const [editorIcon, setEditorIcon] = useState('📝');
  const [editorTag, setEditorTag] = useState('General');
  const [editorPinned, setEditorPinned] = useState(false);
  const [isInteractivePreview, setIsInteractivePreview] = useState(false);
  const [saveStatus, setSaveStatus] = useState('saved'); // 'saved' | 'saving'

  const emojiPickerRef = useRef(null);
  const textareaRef = useRef(null);

  // Close emoji popup on outside click
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target)) {
        setShowEmojiPicker(false);
      }
    };
    window.addEventListener('pointerdown', handleOutsideClick);
    return () => window.removeEventListener('pointerdown', handleOutsideClick);
  }, []);

  // When opening an existing note
  const handleOpenNote = (note) => {
    setActiveNoteId(note.id);
    setEditorTitle(note.title || '');
    setEditorContent(note.content || '');
    setEditorIcon(note.icon || '📝');
    setEditorTag(note.tag || 'General');
    setEditorPinned(!!note.pinned);
    setIsInteractivePreview(false);
    setViewMode('editor');
    setSaveStatus('saved');
  };

  // Create a new blank note
  const handleCreateBlankNote = () => {
    const newId = `note_${Date.now()}`;
    const newNote = {
      id: newId,
      title: 'Untitled Note',
      icon: '📝',
      tag: 'General',
      pinned: false,
      content: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    setActiveNoteId(newId);
    setEditorTitle(newNote.title);
    setEditorContent('');
    setEditorIcon(newNote.icon);
    setEditorTag(newNote.tag);
    setEditorPinned(false);
    setIsInteractivePreview(false);
    setViewMode('editor');
    onSaveNote(newNote);
    showToast('✨ New note created');
  };

  // Auto-save changes with debounced persistence
  const triggerSave = (newValues = {}) => {
    if (!activeNoteId) return;
    setSaveStatus('saving');

    const updatedNote = {
      id: activeNoteId,
      title: newValues.title !== undefined ? newValues.title : editorTitle,
      content: newValues.content !== undefined ? newValues.content : editorContent,
      icon: newValues.icon !== undefined ? newValues.icon : editorIcon,
      tag: newValues.tag !== undefined ? newValues.tag : editorTag,
      pinned: newValues.pinned !== undefined ? newValues.pinned : editorPinned,
      updatedAt: new Date().toISOString()
    };

    onSaveNote(updatedNote);
    setTimeout(() => {
      setSaveStatus('saved');
    }, 250);
  };

  // Quick insertion helpers
  const handleInsertBlock = (prefix, placeholder = '') => {
    const textarea = textareaRef.current;
    if (!textarea) {
      const updated = editorContent ? `${editorContent}\n${prefix}${placeholder}` : `${prefix}${placeholder}`;
      setEditorContent(updated);
      triggerSave({ content: updated });
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const before = editorContent.substring(0, start);
    const after = editorContent.substring(end);
    const insertion = `\n${prefix}${placeholder}`;
    const updated = `${before}${insertion}${after}`;

    setEditorContent(updated);
    triggerSave({ content: updated });

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + insertion.length, start + insertion.length);
    }, 50);
  };

  // Interactive checkbox toggling inside reading mode or cards
  const handleToggleCheckbox = (lineIndex, currentText, noteId = activeNoteId) => {
    const targetNote = notes.find(n => n.id === noteId);
    const textToModify = noteId === activeNoteId ? editorContent : (targetNote?.content || '');
    const lines = textToModify.split('\n');

    if (lines[lineIndex] !== undefined) {
      const line = lines[lineIndex];
      if (line.includes('[ ]')) {
        lines[lineIndex] = line.replace('[ ]', '[x]');
      } else if (line.includes('[x]')) {
        lines[lineIndex] = line.replace('[x]', '[ ]');
      } else if (line.includes('[X]')) {
        lines[lineIndex] = line.replace('[X]', '[ ]');
      }

      const newContent = lines.join('\n');
      if (noteId === activeNoteId) {
        setEditorContent(newContent);
        triggerSave({ content: newContent });
      } else if (targetNote) {
        onSaveNote({
          ...targetNote,
          content: newContent,
          updatedAt: new Date().toISOString()
        });
      }
    }
  };

  // Copy full note text
  const handleCopyNoteText = (note) => {
    const fullText = `# ${note.title}\n\n${note.content || ''}`;
    navigator.clipboard.writeText(fullText).then(() => {
      showToast('📋 Copied to clipboard');
    }).catch(() => {
      showToast('⚠️ Could not copy text');
    });
  };

  // Delete note with confirmation
  const handleDeleteCurrentNote = () => {
    if (window.confirm(`Delete "${editorTitle || 'Untitled'}"?`)) {
      onDeleteNote(activeNoteId);
      setViewMode('list');
      setActiveNoteId(null);
    }
  };

  // Format date readable
  const formatNoteDate = (isoString) => {
    if (!isoString) return '';
    try {
      const date = new Date(isoString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

      if (diffHours < 1) return 'Just now';
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffHours < 48) return 'Yesterday';

      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  };

  // Filter notes by search query and tags
  const filteredNotes = notes.filter(n => {
    if (filterTag === 'PINNED' && !n.pinned) return false;
    if (filterTag !== 'ALL' && filterTag !== 'PINNED' && n.tag !== filterTag) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchTitle = (n.title || '').toLowerCase().includes(q);
      const matchContent = (n.content || '').toLowerCase().includes(q);
      const matchTag = (n.tag || '').toLowerCase().includes(q);
      if (!matchTitle && !matchContent && !matchTag) return false;
    }
    return true;
  }).sort((a, b) => {
    // Pinned notes first, then latest updated
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime();
  });

  // Calculate checklist progress for a note
  const getNoteChecklistStats = (content = '') => {
    const lines = content.split('\n');
    let total = 0;
    let completed = 0;
    lines.forEach(line => {
      if (line.includes('[ ]') || line.includes('[x]') || line.includes('[X]')) {
        total++;
        if (line.includes('[x]') || line.includes('[X]')) {
          completed++;
        }
      }
    });
    return { total, completed, hasChecklist: total > 0 };
  };

  // Parse lines into clean markdown-like nodes
  const renderFormattedLines = (content = '', noteId = activeNoteId) => {
    if (!content) {
      return <p className="apple-empty-body">Tap "Edit Text" to start typing...</p>;
    }

    const lines = content.split('\n');
    return lines.map((line, idx) => {
      const trimmed = line.trim();

      // Heading 3
      if (trimmed.startsWith('### ')) {
        return (
          <h3 key={idx} className="apple-block-h3">
            {trimmed.replace(/^###\s+/, '')}
          </h3>
        );
      }

      // Heading 2
      if (trimmed.startsWith('## ')) {
        return (
          <h2 key={idx} className="apple-block-h2">
            {trimmed.replace(/^##\s+/, '')}
          </h2>
        );
      }

      // Checkbox [ ] or [x]
      if (line.includes('[ ]') || line.includes('[x]') || line.includes('[X]')) {
        const isChecked = line.includes('[x]') || line.includes('[X]');
        const textPart = line.replace(/\[[ xX]\]/, '').trim();
        return (
          <div key={idx} className={`apple-block-todo ${isChecked ? 'done' : ''}`}>
            <button 
              type="button"
              className={`apple-checkbox-btn ${isChecked ? 'checked' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                handleToggleCheckbox(idx, line, noteId);
              }}
              aria-label={isChecked ? 'Mark incomplete' : 'Mark complete'}
            >
              {isChecked ? '✓' : ''}
            </button>
            <span className="apple-todo-text">{textPart}</span>
          </div>
        );
      }

      // Callout quote >
      if (trimmed.startsWith('> ')) {
        return (
          <div key={idx} className="apple-block-callout">
            <span className="callout-symbol">💡</span>
            <span className="callout-text">{trimmed.replace(/^>\s+💡?\s*/, '')}</span>
          </div>
        );
      }

      // Bullet Point
      if (trimmed.startsWith('• ') || trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        const bulletText = trimmed.replace(/^[•\-\*]\s+/, '');
        return (
          <div key={idx} className="apple-block-bullet">
            <span className="bullet-dot">•</span>
            <span className="bullet-text">{bulletText}</span>
          </div>
        );
      }

      // Empty blank line
      if (!trimmed) {
        return <div key={idx} className="apple-block-spacer" />;
      }

      // Normal paragraph
      return (
        <p key={idx} className="apple-block-p">
          {line}
        </p>
      );
    });
  };

  // =========================================================================
  // VIEW 1: NOTE EDITOR / DETAIL PAGE (Simple, Clean Apple Design)
  // =========================================================================
  if (viewMode === 'editor') {
    return (
      <div className="apple-editor-container fade-in">
        {/* Top Header Bar */}
        <div className="apple-editor-topbar">
          <div className="editor-left-actions">
            <button 
              className="apple-back-btn" 
              onClick={() => setViewMode('list')}
              title="Return to Notes"
            >
              <span>← Notes</span>
            </button>
            <span className={`save-pill ${saveStatus}`}>
              {saveStatus === 'saving' ? 'Saving...' : 'Saved'}
            </span>
          </div>

          <div className="editor-right-actions">
            <button 
              className={`apple-icon-btn ${editorPinned ? 'pinned-active' : ''}`}
              onClick={() => {
                const nextPinned = !editorPinned;
                setEditorPinned(nextPinned);
                triggerSave({ pinned: nextPinned });
                showToast(nextPinned ? '📌 Pinned to top' : 'Unpinned');
              }}
              title={editorPinned ? 'Unpin note' : 'Pin note to top'}
            >
              <span>{editorPinned ? '📌 Pinned' : '📌 Pin'}</span>
            </button>

            <button 
              className={`apple-icon-btn ${isInteractivePreview ? 'preview-active' : ''}`}
              onClick={() => setIsInteractivePreview(prev => !prev)}
              title="Toggle checklist preview"
            >
              <span>{isInteractivePreview ? '✏️ Edit' : '👁️ View'}</span>
            </button>

            <button 
              className="apple-icon-btn"
              onClick={() => handleCopyNoteText({ title: editorTitle, content: editorContent })}
              title="Copy note"
            >
              <span>📋</span>
            </button>

            <button 
              className="apple-icon-btn delete-btn"
              onClick={handleDeleteCurrentNote}
              title="Delete note"
            >
              <span>🗑️</span>
            </button>
          </div>
        </div>

        {/* Note Body Card */}
        <div className="apple-page-card">
          {/* Icon & Title Row */}
          <div className="apple-page-header">
            <div className="apple-icon-picker-wrap" ref={emojiPickerRef}>
              <button 
                type="button"
                className="apple-icon-display-btn"
                onClick={() => setShowEmojiPicker(prev => !prev)}
                title="Change Emoji Icon"
              >
                <span>{editorIcon}</span>
              </button>

              {showEmojiPicker && (
                <div className="apple-emoji-palette fade-in">
                  <div className="emoji-palette-grid">
                    {EMOJI_PALETTE.map(emoji => (
                      <button 
                        key={emoji}
                        type="button"
                        className={`emoji-choice-btn ${editorIcon === emoji ? 'selected' : ''}`}
                        onClick={() => {
                          setEditorIcon(emoji);
                          setShowEmojiPicker(false);
                          triggerSave({ icon: emoji });
                        }}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="apple-title-wrap">
              <input 
                type="text"
                className="apple-title-input"
                placeholder="Title..."
                value={editorTitle}
                onChange={(e) => {
                  setEditorTitle(e.target.value);
                  triggerSave({ title: e.target.value });
                }}
              />
            </div>
          </div>

          {/* Category Tag Selector */}
          <div className="apple-tag-chips-row">
            {NOTE_TAGS.map(t => (
              <button 
                key={t}
                type="button"
                className={`apple-tag-chip ${editorTag === t ? 'active' : ''}`}
                onClick={() => {
                  setEditorTag(t);
                  triggerSave({ tag: t });
                }}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Quick Block Inserters (When Editing) */}
          {!isInteractivePreview && (
            <div className="apple-quick-blocks-bar">
              <button 
                type="button" 
                className="quick-block-btn"
                onClick={() => handleInsertBlock('[ ] ', 'Checklist item')}
              >
                ☑️ Checkbox
              </button>
              <button 
                type="button" 
                className="quick-block-btn"
                onClick={() => handleInsertBlock('• ', 'Rule / Collocation')}
              >
                • Bullet
              </button>
              <button 
                type="button" 
                className="quick-block-btn"
                onClick={() => handleInsertBlock('> 💡 Tip: ', 'Study tip')}
              >
                💡 Tip
              </button>
            </div>
          )}

          {/* Content Area */}
          <div className="apple-page-content-area">
            {isInteractivePreview ? (
              <div className="apple-interactive-reader fade-in">
                {renderFormattedLines(editorContent, activeNoteId)}
              </div>
            ) : (
              <textarea 
                ref={textareaRef}
                className="apple-page-textarea"
                placeholder="Type your notes here...&#10;&#10;Use [ ] for checklists&#10;Use • for bullet points&#10;Use > for tips"
                value={editorContent}
                onChange={(e) => {
                  setEditorContent(e.target.value);
                  triggerSave({ content: e.target.value });
                }}
              />
            )}
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // VIEW 2: NOTES LIST (Clean, Simple, Apple-Style Layout)
  // =========================================================================
  return (
    <div className="apple-notes-view-container fade-in">
      {/* Sleek Top Bar: Search Input on left + '+ New Note' on right */}
      <div className="apple-notes-controls-bar">
        <div className="apple-search-shell">
          <span className="search-icon">🔍</span>
          <input 
            type="text"
            className="apple-search-input"
            placeholder="Search notes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button 
              type="button"
              className="apple-search-clear-btn" 
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
        </div>

        <button 
          type="button"
          className="apple-new-note-btn"
          onClick={handleCreateBlankNote}
        >
          <span>＋ New Note</span>
        </button>
      </div>

      {/* Filter Chips Row */}
      <div className="apple-filter-chips-row">
        <button 
          type="button"
          className={`apple-filter-chip ${filterTag === 'ALL' ? 'active' : ''}`}
          onClick={() => setFilterTag('ALL')}
        >
          All ({notes.length})
        </button>
        {notes.some(n => n.pinned) && (
          <button 
            type="button"
            className={`apple-filter-chip ${filterTag === 'PINNED' ? 'active' : ''}`}
            onClick={() => setFilterTag('PINNED')}
          >
            📌 Pinned ({notes.filter(n => n.pinned).length})
          </button>
        )}
        {NOTE_TAGS.map(t => {
          const count = notes.filter(n => n.tag === t).length;
          if (count === 0 && filterTag !== t) return null;
          return (
            <button 
              key={t}
              type="button"
              className={`apple-filter-chip ${filterTag === t ? 'active' : ''}`}
              onClick={() => setFilterTag(t)}
            >
              {t} ({count})
            </button>
          );
        })}
      </div>

      {/* Notes Grid / List */}
      {filteredNotes.length > 0 ? (
        <div className="apple-notes-grid">
          {filteredNotes.map(note => {
            const checkStats = getNoteChecklistStats(note.content);
            return (
              <div 
                key={note.id} 
                className={`apple-note-card ${note.pinned ? 'card-pinned' : ''}`}
                onClick={() => handleOpenNote(note)}
              >
                {/* Top Row: Icon + Title + Pin */}
                <div className="note-card-top-row">
                  <div className="note-card-icon-title">
                    <span className="note-card-emoji">{note.icon || '📝'}</span>
                    <h3 className="note-card-title">{note.title || 'Untitled'}</h3>
                  </div>

                  <button 
                    type="button"
                    className={`card-pin-btn ${note.pinned ? 'pinned' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onPinNote(note.id);
                      showToast(note.pinned ? 'Unpinned' : '📌 Pinned');
                    }}
                    title={note.pinned ? 'Unpin note' : 'Pin note to top'}
                  >
                    📌
                  </button>
                </div>

                {/* Tag Badge & Checklist Progress */}
                <div className="note-card-meta-row">
                  <span className={`apple-card-tag tag-${(note.tag || 'general').toLowerCase()}`}>
                    {note.tag || 'General'}
                  </span>

                  {checkStats.hasChecklist && (
                    <span className="apple-checklist-badge">
                      ✓ {checkStats.completed}/{checkStats.total}
                    </span>
                  )}
                </div>

                {/* Content Snippet Preview */}
                <div className="note-card-snippet">
                  {note.content ? (
                    note.content
                      .split('\n')
                      .filter(l => l.trim() && !l.startsWith('###'))
                      .slice(0, 3)
                      .join(' · ')
                  ) : (
                    <em>Empty note...</em>
                  )}
                </div>

                {/* Card Footer */}
                <div className="note-card-footer">
                  <span className="note-card-date">{formatNoteDate(note.updatedAt || note.createdAt)}</span>

                  <div className="note-card-actions">
                    <button 
                      type="button"
                      className="card-quick-action-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCopyNoteText(note);
                      }}
                      title="Copy note"
                    >
                      📋
                    </button>
                    <button 
                      type="button"
                      className="card-quick-action-btn delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (window.confirm(`Delete "${note.title || 'Untitled'}"?`)) {
                          onDeleteNote(note.id);
                        }
                      }}
                      title="Delete note"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="apple-empty-notes-card">
          <span className="empty-apple-icon">📝</span>
          <h3 className="empty-apple-title">
            {searchQuery ? `No notes matching "${searchQuery}"` : 'No Notes Yet'}
          </h3>
          <p className="empty-apple-subtitle">
            {searchQuery 
              ? 'Try another search term.' 
              : 'Tap "＋ New Note" to jot down your vocabulary rules, collocations, or ideas.'}
          </p>

          <div className="empty-apple-actions">
            {searchQuery ? (
              <button 
                type="button"
                className="apple-search-clear-action-btn"
                onClick={() => setSearchQuery('')}
              >
                Clear Search
              </button>
            ) : (
              <button 
                type="button"
                className="apple-new-note-btn btn-large"
                onClick={handleCreateBlankNote}
              >
                <span>＋ Create Note</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
