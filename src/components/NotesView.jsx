import React, { useState, useEffect, useRef } from 'react';

const EMOJI_PALETTE = [
  '📝', '💡', '🎯', '📖', '⚡', '📌', '🌟', '✍️',
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

const TEMPLATES = [
  {
    name: '💡 IELTS Essay Collocations',
    desc: 'High-scoring phrase patterns for Task 2 essays',
    icon: '💡',
    tag: 'IELTS',
    content: `### High-Band Academic Collocations for Essays

• **play a pivotal role in**
  e.g. *Higher education plays a pivotal role in promoting social mobility.*

• **exert a profound influence on**
  e.g. *Technological innovations exert a profound influence on the job market.*

• **pose a severe threat to**
  e.g. *Plastic pollution poses a severe threat to marine ecosystems.*

• **reap substantial benefits from**
  e.g. *Students reap substantial benefits from early bilingual education.*

• **bridge the socioeconomic divide**
  e.g. *Subsidized public transit helps bridge the socioeconomic divide in metropolitan areas.*

• **strike a delicate balance between**
  e.g. *Policy makers must strike a delicate balance between industrial expansion and green conservation.*`
  },
  {
    name: '⚡ Tricky Spelling Checklist',
    desc: 'Checklist of high-frequency commonly misspelled words',
    icon: '⚡',
    tag: 'Spelling',
    content: `### High-Frequency IELTS Misspellings Checklist

[ ] accommodate (double 'c', double 'm')
[ ] privilege (no 'd', ends in -ege)
[ ] conscientious (c-i-e-n)
[ ] embarrassment (double 'r', double 's')
[ ] pronunciation (pro-NUN-ciation, not pronounce)
[ ] hierarchy (i before e)
[ ] definitely (finite inside definitely: d-e-f-i-n-i-t-e-l-y)
[ ] gauge (g-a-u-g-e)
[ ] noticeable (keep the 'e' before -able)

> 💡 Rule of Thumb: When a word ends with a silent 'e', drop it before adding an -ing or -able suffix (argue → arguing).`
  },
  {
    name: '🎯 Word Family & Root Words',
    desc: 'Deep-dive word derivation matrix (Noun, Verb, Adj, Adv)',
    icon: '🎯',
    tag: 'Vocabulary',
    content: `### Word Family Matrix: Analyze (AWL Sublist 1)

• **Verb**: analyze (examine methodically)
• **Noun**: analysis, analyzer
• **Adjective**: analytical, analytic
• **Adverb**: analytically

### Essential Collocations:
• *conduct a rigorous analysis of the data*
• *provide an analytical framework*
• *closer analysis reveals that...*`
  },
  {
    name: '🏛️ IELTS Task 2 Idea Bank',
    desc: 'Pros & cons argument structure for IELTS topics',
    icon: '🏛️',
    tag: 'Ideas',
    content: `### Topic: Remote Work & Automation in Modern Society

### Arguments In Favor:
• **Flexibility & Work-Life Balance**: Cuts commuting time, reduces carbon footprint.
• **Global Talent Access**: Employers can recruit skilled workers regardless of geographic borders.

### Arguments Against / Concerns:
• **Social Isolation**: Lack of face-to-face interaction damages teamwork and mental wellbeing.
• **Blurred Boundaries**: Workers struggle to disconnect after formal work hours.

> 💡 Conclusion Synthesis: While telecommuting improves productivity, hybrid arrangements offer the optimal compromise.`
  }
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
  const [showTemplateMenu, setShowTemplateMenu] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  // Editor State
  const [editorTitle, setEditorTitle] = useState('');
  const [editorContent, setEditorContent] = useState('');
  const [editorIcon, setEditorIcon] = useState('📝');
  const [editorTag, setEditorTag] = useState('General');
  const [editorPinned, setEditorPinned] = useState(false);
  const [isInteractivePreview, setIsInteractivePreview] = useState(false);
  const [saveStatus, setSaveStatus] = useState('saved'); // 'saved' | 'saving'

  const templateMenuRef = useRef(null);
  const emojiPickerRef = useRef(null);
  const textareaRef = useRef(null);

  // Close popups on outside click
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (templateMenuRef.current && !templateMenuRef.current.contains(e.target)) {
        setShowTemplateMenu(false);
      }
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
    showToast('✨ Created new note');
  };

  // Apply a template
  const handleApplyTemplate = (tpl) => {
    const newId = `note_${Date.now()}`;
    const newNote = {
      id: newId,
      title: tpl.name.replace(/^[^\w\s]+/, '').trim(),
      icon: tpl.icon,
      tag: tpl.tag,
      pinned: false,
      content: tpl.content,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    setShowTemplateMenu(false);
    setActiveNoteId(newId);
    setEditorTitle(newNote.title);
    setEditorContent(newNote.content);
    setEditorIcon(newNote.icon);
    setEditorTag(newNote.tag);
    setEditorPinned(false);
    setIsInteractivePreview(false);
    setViewMode('editor');
    onSaveNote(newNote);
    showToast(`📋 Created note from "${tpl.name}"`);
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
    }, 300);
  };

  // Quick insertion helpers for Notion blocks
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
      showToast('📋 Note copied to clipboard');
    }).catch(() => {
      showToast('⚠️ Could not copy text');
    });
  };

  // Delete note with confirmation
  const handleDeleteCurrentNote = () => {
    if (window.confirm(`Delete note "${editorTitle || 'Untitled'}"?`)) {
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
      return <p className="notion-empty-body">Click here to write notes, collocations, or spelling rules...</p>;
    }

    const lines = content.split('\n');
    return lines.map((line, idx) => {
      const trimmed = line.trim();

      // Heading 3
      if (trimmed.startsWith('### ')) {
        return (
          <h3 key={idx} className="notion-block-h3">
            {trimmed.replace(/^###\s+/, '')}
          </h3>
        );
      }

      // Heading 2
      if (trimmed.startsWith('## ')) {
        return (
          <h2 key={idx} className="notion-block-h2">
            {trimmed.replace(/^##\s+/, '')}
          </h2>
        );
      }

      // Checkbox [ ] or [x]
      if (line.includes('[ ]') || line.includes('[x]') || line.includes('[X]')) {
        const isChecked = line.includes('[x]') || line.includes('[X]');
        const textPart = line.replace(/\[[ xX]\]/, '').trim();
        return (
          <div key={idx} className={`notion-block-todo ${isChecked ? 'done' : ''}`}>
            <button 
              type="button"
              className={`notion-checkbox-btn ${isChecked ? 'checked' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                handleToggleCheckbox(idx, line, noteId);
              }}
              aria-label={isChecked ? 'Mark incomplete' : 'Mark complete'}
            >
              {isChecked ? '✓' : ''}
            </button>
            <span className="notion-todo-text">{textPart}</span>
          </div>
        );
      }

      // Callout quote >
      if (trimmed.startsWith('> ')) {
        return (
          <div key={idx} className="notion-block-callout">
            <span className="callout-symbol">💡</span>
            <span className="callout-text">{trimmed.replace(/^>\s+💡?\s*/, '')}</span>
          </div>
        );
      }

      // Bullet Point
      if (trimmed.startsWith('• ') || trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        const bulletText = trimmed.replace(/^[•\-\*]\s+/, '');
        return (
          <div key={idx} className="notion-block-bullet">
            <span className="bullet-dot">•</span>
            <span className="bullet-text">{bulletText}</span>
          </div>
        );
      }

      // Empty blank line
      if (!trimmed) {
        return <div key={idx} className="notion-block-spacer" />;
      }

      // Normal paragraph
      return (
        <p key={idx} className="notion-block-p">
          {line}
        </p>
      );
    });
  };

  // =========================================================================
  // VIEW 1: NOTE EDITOR / DETAIL PAGE
  // =========================================================================
  if (viewMode === 'editor') {
    return (
      <div className="notion-editor-container fade-in">
        {/* Top Sticky Header */}
        <div className="notion-editor-topbar">
          <div className="editor-left-actions">
            <button 
              className="notion-back-btn" 
              onClick={() => setViewMode('list')}
              title="Return to Notes List"
            >
              <span>← Notes</span>
            </button>
            <span className={`save-pill ${saveStatus}`}>
              {saveStatus === 'saving' ? 'Saving...' : 'Saved ✓'}
            </span>
          </div>

          <div className="editor-right-actions">
            <button 
              className={`editor-icon-btn ${editorPinned ? 'pinned-active' : ''}`}
              onClick={() => {
                const nextPinned = !editorPinned;
                setEditorPinned(nextPinned);
                triggerSave({ pinned: nextPinned });
                showToast(nextPinned ? '📌 Pinned to top' : 'Unpinned note');
              }}
              title={editorPinned ? 'Unpin note' : 'Pin note to top'}
            >
              <span>{editorPinned ? '📌 Pinned' : '📌 Pin'}</span>
            </button>

            <button 
              className={`editor-icon-btn ${isInteractivePreview ? 'preview-active' : ''}`}
              onClick={() => setIsInteractivePreview(prev => !prev)}
              title="Toggle interactive checklist preview mode"
            >
              <span>{isInteractivePreview ? '✏️ Edit Text' : '👁️ Interactive'}</span>
            </button>

            <button 
              className="editor-icon-btn"
              onClick={() => handleCopyNoteText({ title: editorTitle, content: editorContent })}
              title="Copy note text"
            >
              <span>📋</span>
            </button>

            <button 
              className="editor-icon-btn delete-btn"
              onClick={handleDeleteCurrentNote}
              title="Delete note"
            >
              <span>🗑️</span>
            </button>
          </div>
        </div>

        {/* Notion Page Body */}
        <div className="notion-page-card">
          {/* Top Gradient Accent Strip */}
          <div className="notion-page-accent-strip" />

          {/* Icon & Title Row */}
          <div className="notion-page-header">
            <div className="notion-icon-picker-wrap" ref={emojiPickerRef}>
              <button 
                type="button"
                className="notion-icon-display-btn"
                onClick={() => setShowEmojiPicker(prev => !prev)}
                title="Change Note Emoji Icon"
              >
                <span>{editorIcon}</span>
              </button>

              {showEmojiPicker && (
                <div className="notion-emoji-palette fade-in">
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

            <div className="notion-title-wrap">
              <input 
                type="text"
                className="notion-title-input"
                placeholder="Untitled Note..."
                value={editorTitle}
                onChange={(e) => {
                  setEditorTitle(e.target.value);
                  triggerSave({ title: e.target.value });
                }}
              />
            </div>
          </div>

          {/* Category Tag Selector */}
          <div className="notion-tag-chips-row">
            <span className="notion-tag-label">Category:</span>
            {NOTE_TAGS.map(t => (
              <button 
                key={t}
                type="button"
                className={`notion-tag-chip ${editorTag === t ? 'active' : ''} tag-${t.toLowerCase()}`}
                onClick={() => {
                  setEditorTag(t);
                  triggerSave({ tag: t });
                }}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Quick Notion Block Inserters Toolbar (in Edit Mode) */}
          {!isInteractivePreview && (
            <div className="notion-quick-blocks-bar">
              <span className="quick-blocks-hint">Insert block:</span>
              <button 
                type="button" 
                className="quick-block-btn"
                onClick={() => handleInsertBlock('[ ] ', 'New study checklist item')}
              >
                ☑️ Checkbox
              </button>
              <button 
                type="button" 
                className="quick-block-btn"
                onClick={() => handleInsertBlock('• ', 'High-band collocation or rule')}
              >
                • Bullet
              </button>
              <button 
                type="button" 
                className="quick-block-btn"
                onClick={() => handleInsertBlock('> 💡 Tip: ', 'Important IELTS memory tip')}
              >
                💡 Tip Box
              </button>
              <button 
                type="button" 
                className="quick-block-btn"
                onClick={() => handleInsertBlock('### ', 'Section Header')}
              >
                H Header
              </button>
            </div>
          )}

          {/* Content Area: Editor Textarea or Interactive Checklist Reader */}
          <div className="notion-page-content-area">
            {isInteractivePreview ? (
              <div className="notion-interactive-reader fade-in">
                {renderFormattedLines(editorContent, activeNoteId)}
              </div>
            ) : (
              <textarea 
                ref={textareaRef}
                className="notion-page-textarea"
                placeholder="Type your study notes, essay collocations, or spelling checklists here...&#10;&#10;💡 Quick Tips:&#10;• Type '[ ] ' to make an interactive checkbox&#10;• Type '• ' or '- ' for bullet points&#10;• Type '> 💡 ' for a highlight tip box&#10;• Type '### ' for section headers"
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
  // VIEW 2: NOTES LIST & GALLERY (Default Notion Workspace)
  // =========================================================================
  return (
    <div className="notion-notes-view-container fade-in">
      {/* Top Workspace Header */}
      <div className="notion-workspace-header">
        <div className="workspace-header-text">
          <div className="notion-badge-row">
            <span className="notion-app-icon">📓</span>
            <span className="notion-app-title">Study Notes & Notion Desk</span>
            <span className="notion-count-pill">{notes.length} {notes.length === 1 ? 'note' : 'notes'}</span>
          </div>
          <p className="notion-workspace-subtitle">
            Personal vocabulary notebook, IELTS collocations, essay idea bank, and spelling checklists.
          </p>
        </div>

        <div className="workspace-header-actions">
          {/* Template Menu Dropdown */}
          <div className="notion-template-wrap" ref={templateMenuRef}>
            <button 
              type="button"
              className="notion-template-trigger-btn"
              onClick={() => setShowTemplateMenu(prev => !prev)}
            >
              <span>⚡ Templates ▾</span>
            </button>

            {showTemplateMenu && (
              <div className="notion-templates-menu fade-in">
                <div className="template-menu-header">
                  <strong>Study Templates</strong>
                  <span>1-click structured study notes</span>
                </div>
                {TEMPLATES.map((tpl, i) => (
                  <button 
                    key={i}
                    type="button"
                    className="template-menu-item"
                    onClick={() => handleApplyTemplate(tpl)}
                  >
                    <span className="tpl-item-icon">{tpl.icon}</span>
                    <div className="tpl-item-info">
                      <strong className="tpl-item-name">{tpl.name}</strong>
                      <span className="tpl-item-desc">{tpl.desc}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* New Note Button */}
          <button 
            type="button"
            className="notion-new-note-btn"
            onClick={handleCreateBlankNote}
          >
            <span>＋ New Note</span>
          </button>
        </div>
      </div>

      {/* Search & Filter Controls Bar */}
      <div className="notion-controls-bar">
        <div className="notion-search-shell">
          <span className="search-icon">🔍</span>
          <input 
            type="text"
            className="notion-search-input"
            placeholder="Search notes by title, tag, or content..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button 
              className="notion-search-clear-btn" 
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
        </div>

        <div className="notion-filter-chips-row">
          <button 
            type="button"
            className={`notion-filter-chip ${filterTag === 'ALL' ? 'active' : ''}`}
            onClick={() => setFilterTag('ALL')}
          >
            All ({notes.length})
          </button>
          <button 
            type="button"
            className={`notion-filter-chip ${filterTag === 'PINNED' ? 'active' : ''}`}
            onClick={() => setFilterTag('PINNED')}
          >
            📌 Pinned ({notes.filter(n => n.pinned).length})
          </button>
          {NOTE_TAGS.map(t => {
            const count = notes.filter(n => n.tag === t).length;
            if (count === 0 && filterTag !== t) return null;
            return (
              <button 
                key={t}
                type="button"
                className={`notion-filter-chip ${filterTag === t ? 'active' : ''}`}
                onClick={() => setFilterTag(t)}
              >
                {t} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* Notes Grid */}
      {filteredNotes.length > 0 ? (
        <div className="notion-notes-grid">
          {filteredNotes.map(note => {
            const checkStats = getNoteChecklistStats(note.content);
            return (
              <div 
                key={note.id} 
                className={`notion-note-card ${note.pinned ? 'card-pinned' : ''}`}
                onClick={() => handleOpenNote(note)}
              >
                {/* Pinned Accent Header */}
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
                      showToast(note.pinned ? 'Unpinned note' : '📌 Pinned to top');
                    }}
                    title={note.pinned ? 'Unpin note' : 'Pin to top'}
                  >
                    📌
                  </button>
                </div>

                {/* Tag Badge & Checklist Progress */}
                <div className="note-card-meta-row">
                  <span className={`notion-card-tag tag-${(note.tag || 'general').toLowerCase()}`}>
                    {note.tag || 'General'}
                  </span>

                  {checkStats.hasChecklist && (
                    <span className="notion-checklist-badge">
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
                      title="Copy note text"
                    >
                      📋
                    </button>
                    <button 
                      type="button"
                      className="card-quick-action-btn delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (window.confirm(`Delete note "${note.title || 'Untitled'}"?`)) {
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
        <div className="notion-empty-workspace-card">
          <div className="empty-workspace-icon">📓</div>
          <h3 className="empty-workspace-title">
            {searchQuery ? `No notes found matching "${searchQuery}"` : 'Your Personal Note Desk is Clean'}
          </h3>
          <p className="empty-workspace-subtitle">
            {searchQuery 
              ? 'Try searching for other words or clear the search filter.' 
              : 'Keep track of IELTS vocabulary, essay collocations, and spelling rules in a mini Notion format.'}
          </p>

          <div className="empty-workspace-actions">
            {searchQuery ? (
              <button 
                type="button"
                className="cta-navy-button"
                onClick={() => setSearchQuery('')}
              >
                Clear Search
              </button>
            ) : (
              <>
                <button 
                  type="button"
                  className="cta-red-button"
                  onClick={handleCreateBlankNote}
                >
                  <span>＋ Create First Note</span>
                </button>
                <button 
                  type="button"
                  className="ghost-pill-btn"
                  onClick={() => handleApplyTemplate(TEMPLATES[0])}
                >
                  ⚡ Insert IELTS Collocations Template
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
