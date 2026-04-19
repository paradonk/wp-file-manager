/**
 * Developer File Manager - SPA JavaScript
 * Vanilla JS, no framework dependencies.
 */
(function () {
    'use strict';

    /* ── Helpers ─────────────────────────────────────────────── */
    function esc(str) {
        var d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    }

    function formatSize(bytes) {
        if (!bytes || bytes === 0) return '—';
        var units = ['B', 'KB', 'MB', 'GB'];
        var i = 0;
        var b = bytes;
        while (b >= 1024 && i < units.length - 1) { b /= 1024; i++; }
        return b.toFixed(i === 0 ? 0 : 1) + ' ' + units[i];
    }

    function formatDate(ts) {
        if (!ts) return '—';
        var d = new Date(ts * 1000);
        return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    function getIcon(item) {
        if (item.is_dir) return 'dashicons-category';
        var ext = item.type || '';
        var images = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'ico'];
        var code   = ['html', 'htm', 'css', 'json', 'xml', 'sql', 'yml', 'yaml', 'md', 'csv', 'txt'];
        var audio  = ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'];
        var video  = ['mp4', 'avi', 'mov', 'wmv', 'mkv', 'webm'];
        var docs   = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'rtf', 'odt'];
        var zips   = ['zip', 'tar', 'gz', 'bz2', 'rar', '7z'];
        if (images.indexOf(ext) !== -1) return 'dashicons-format-image';
        if (code.indexOf(ext) !== -1)   return 'dashicons-editor-code';
        if (audio.indexOf(ext) !== -1)  return 'dashicons-format-audio';
        if (video.indexOf(ext) !== -1)  return 'dashicons-format-video';
        if (docs.indexOf(ext) !== -1)   return 'dashicons-media-document';
        if (zips.indexOf(ext) !== -1)   return 'dashicons-archive';
        return 'dashicons-media-default';
    }

    function isImageExt(ext) {
        return ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'ico'].indexOf(ext) !== -1;
    }

    function isZipExt(ext) {
        return ext === 'zip';
    }

    function copyToClipboard(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            return navigator.clipboard.writeText(text);
        }
        // Fallback for older browsers
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        try { document.execCommand('copy'); } catch (e) {}
        document.body.removeChild(ta);
        return Promise.resolve();
    }

    /* ── Bookmarks (localStorage) ───────────────────────────── */
    var BOOKMARKS_KEY = 'dfm_bookmarks';

    function loadBookmarks() {
        try {
            return JSON.parse(localStorage.getItem(BOOKMARKS_KEY) || '[]');
        } catch (e) { return []; }
    }

    function saveBookmarks(bm) {
        try { localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(bm)); } catch (e) {}
    }

    /* ── FileManager Class ──────────────────────────────────── */
    function FileManager() {
        this.currentPath   = '';
        this.selectedItems = [];
        this.viewMode      = 'list';
        this.clipboard     = null;   // { items: [], operation: 'copy'|'cut' }
        this.items         = [];
        this.lastClickedIndex = -1;
        this.loading       = false;
        this.dragging      = null;
        this._modalOnClose    = null;
        this._backdropHandler = null;
        this._treeHandlers    = null;

        // Sort state
        this.sortKey = 'name';
        this.sortDir = 1; // 1 = asc, -1 = desc

        // Search state
        this.searchQuery = '';

        // Navigation history
        this.history      = [''];
        this.historyIndex = 0;

        this.els = {
            toolbar:       document.getElementById('dfm-toolbar'),
            breadcrumb:    document.getElementById('dfm-breadcrumb'),
            tree:          document.getElementById('dfm-tree'),
            fileList:      document.getElementById('dfm-file-list'),
            main:          document.getElementById('dfm-main'),
            dropOverlay:   document.getElementById('dfm-drop-overlay'),
            contextMenu:   document.getElementById('dfm-context-menu'),
            modal:         document.getElementById('dfm-modal'),
            backdrop:      document.getElementById('dfm-modal-backdrop'),
            toastContainer:document.getElementById('dfm-toast-container'),
        };

        this.init();
    }

    FileManager.prototype.init = function () {
        this.renderToolbar();
        this.bindEvents();
        this.loadTree();
        this.navigateInternal('');
    };

    /* ── AJAX ────────────────────────────────────────────────── */
    FileManager.prototype.ajax = function (params, callback) {
        var fd;

        if (params.formData) {
            fd = params.formData;
            fd.append('action', 'dfm_action');
            fd.append('nonce', dfmData.nonce);
            fd.append('action_type', params.action_type);
        } else {
            fd = new FormData();
            fd.append('action', 'dfm_action');
            fd.append('nonce', dfmData.nonce);
            Object.keys(params).forEach(function (k) {
                if (k === 'formData') return;
                var val = params[k];
                if (Array.isArray(val)) {
                    val.forEach(function (v) { fd.append(k + '[]', v); });
                } else {
                    fd.append(k, val);
                }
            });
        }

        var xhr = new XMLHttpRequest();
        xhr.open('POST', dfmData.ajaxUrl, true);
        xhr.onreadystatechange = function () {
            if (xhr.readyState !== 4) return;
            try {
                var resp = JSON.parse(xhr.responseText);
                callback(resp.success, resp.data);
            } catch (e) {
                callback(false, { message: 'Invalid server response.' });
            }
        };
        xhr.send(fd);
    };

    /* ── Navigation ─────────────────────────────────────────── */

    /**
     * Navigate and push to history.
     */
    FileManager.prototype.navigate = function (path) {
        path = path || '';
        // Only push to history if different from current
        if (path !== this.currentPath) {
            // Truncate forward history when branching
            this.history = this.history.slice(0, this.historyIndex + 1);
            this.history.push(path);
            this.historyIndex = this.history.length - 1;
        }
        this.navigateInternal(path);
    };

    /**
     * Internal navigate — does not modify history.
     */
    FileManager.prototype.navigateInternal = function (path) {
        var self = this;
        this.currentPath      = path || '';
        this.selectedItems    = [];
        this.lastClickedIndex = -1;
        this.searchQuery      = '';
        var searchInput = document.getElementById('dfm-search-input');
        if (searchInput) searchInput.value = '';
        this.setLoading(true);
        this.updateNavButtons();

        this.ajax({ action_type: 'list', path: this.currentPath }, function (ok, data) {
            self.setLoading(false);
            if (ok) {
                self.items = data.items || [];
                self.renderBreadcrumb();
                self.renderFileList();
                self.updateToolbarState();
                self.highlightTreeNode(self.currentPath);
            } else {
                self.toast(data.message || 'Failed to load directory.', 'error');
            }
        });
    };

    FileManager.prototype.goBack = function () {
        if (this.historyIndex > 0) {
            this.historyIndex--;
            this.navigateInternal(this.history[this.historyIndex]);
        }
    };

    FileManager.prototype.goForward = function () {
        if (this.historyIndex < this.history.length - 1) {
            this.historyIndex++;
            this.navigateInternal(this.history[this.historyIndex]);
        }
    };

    FileManager.prototype.updateNavButtons = function () {
        var btnBack    = document.getElementById('dfm-btn-back');
        var btnForward = document.getElementById('dfm-btn-forward');
        if (btnBack)    btnBack.disabled    = (this.historyIndex <= 0);
        if (btnForward) btnForward.disabled = (this.historyIndex >= this.history.length - 1);
    };

    /* ── Loading ─────────────────────────────────────────────── */
    FileManager.prototype.setLoading = function (on) {
        this.loading = on;
        if (on) {
            this.els.fileList.innerHTML = '<div class="dfm-loading"><div class="dfm-spinner"></div> Loading…</div>';
        }
    };

    /* ── Breadcrumb ──────────────────────────────────────────── */
    FileManager.prototype.renderBreadcrumb = function () {
        var self  = this;
        var parts = this.currentPath ? this.currentPath.split('/') : [];
        var html  = '';

        html += '<span class="dfm-breadcrumb-item" data-path="">Root</span>';

        var accumulated = '';
        for (var i = 0; i < parts.length; i++) {
            html += '<span class="dfm-breadcrumb-separator">/</span>';
            accumulated += (i > 0 ? '/' : '') + parts[i];
            if (i === parts.length - 1) {
                html += '<span class="dfm-breadcrumb-current">' + esc(parts[i]) + '</span>';
            } else {
                html += '<span class="dfm-breadcrumb-item" data-path="' + esc(accumulated) + '">' + esc(parts[i]) + '</span>';
            }
        }

        this.els.breadcrumb.innerHTML = html;

        this.els.breadcrumb.querySelectorAll('.dfm-breadcrumb-item').forEach(function (el) {
            el.addEventListener('click', function () {
                self.navigate(this.dataset.path);
            });
        });
    };

    /* ── Toolbar ─────────────────────────────────────────────── */
    FileManager.prototype.renderToolbar = function () {
        var self = this;
        var html = '';

        // Navigation
        html += '<div class="dfm-toolbar-group">';
        html += '<button id="dfm-btn-back" title="Back" disabled><span class="dashicons dashicons-arrow-left-alt"></span></button>';
        html += '<button id="dfm-btn-forward" title="Forward" disabled><span class="dashicons dashicons-arrow-right-alt"></span></button>';
        html += '</div>';
        html += '<div class="dfm-toolbar-separator"></div>';

        // Create
        html += '<div class="dfm-toolbar-group">';
        html += '<button id="dfm-btn-upload" title="Upload files"><span class="dashicons dashicons-upload"></span><span class="dfm-btn-label">Upload</span></button>';
        html += '<button id="dfm-btn-newfolder" title="New folder"><span class="dashicons dashicons-plus-alt"></span><span class="dfm-btn-label">New Folder</span></button>';
        html += '<button id="dfm-btn-newfile" title="New file"><span class="dashicons dashicons-media-default"></span><span class="dfm-btn-label">New File</span></button>';
        html += '</div>';
        html += '<div class="dfm-toolbar-separator"></div>';

        // Clipboard
        html += '<div class="dfm-toolbar-group">';
        html += '<button id="dfm-btn-copy" title="Copy (Ctrl+C)" disabled><span class="dashicons dashicons-admin-page"></span><span class="dfm-btn-label">Copy</span></button>';
        html += '<button id="dfm-btn-cut" title="Cut (Ctrl+X)" disabled><span class="dashicons dashicons-scissors"></span><span class="dfm-btn-label">Cut</span></button>';
        html += '<button id="dfm-btn-paste" title="Paste (Ctrl+V)" disabled><span class="dashicons dashicons-clipboard"></span><span class="dfm-btn-label">Paste</span></button>';
        html += '</div>';
        html += '<div class="dfm-toolbar-separator"></div>';

        // File ops
        html += '<div class="dfm-toolbar-group">';
        html += '<button id="dfm-btn-rename" title="Rename (F2)" disabled><span class="dashicons dashicons-edit"></span><span class="dfm-btn-label">Rename</span></button>';
        html += '<button id="dfm-btn-delete" title="Delete (Del)" disabled><span class="dashicons dashicons-trash"></span><span class="dfm-btn-label">Delete</span></button>';
        html += '<button id="dfm-btn-download-sel" title="Download selection" disabled><span class="dashicons dashicons-download"></span><span class="dfm-btn-label">Download</span></button>';
        html += '</div>';
        html += '<div class="dfm-toolbar-separator"></div>';

        // Batch rename & compress
        html += '<div class="dfm-toolbar-group">';
        html += '<button id="dfm-btn-batch-rename" title="Batch rename" disabled><span class="dashicons dashicons-tag"></span><span class="dfm-btn-label">Batch Rename</span></button>';
        html += '<button id="dfm-btn-compress" title="Compress to ZIP" disabled><span class="dashicons dashicons-archive"></span><span class="dfm-btn-label">Compress</span></button>';
        html += '</div>';
        html += '<div class="dfm-toolbar-separator"></div>';

        // Bookmarks
        html += '<div class="dfm-toolbar-group">';
        html += '<button id="dfm-btn-bookmark-add" title="Bookmark this folder"><span class="dashicons dashicons-star-empty"></span></button>';
        html += '</div>';
        html += '<div class="dfm-toolbar-separator"></div>';

        // Refresh & view toggle
        html += '<div class="dfm-toolbar-group">';
        html += '<button id="dfm-btn-refresh" title="Refresh"><span class="dashicons dashicons-update"></span></button>';
        html += '</div>';
        html += '<div class="dfm-toolbar-separator"></div>';

        html += '<div class="dfm-toolbar-group">';
        html += '<button id="dfm-btn-grid" title="Grid view"><span class="dashicons dashicons-grid-view"></span></button>';
        html += '<button id="dfm-btn-list" title="List view" class="dfm-active"><span class="dashicons dashicons-list-view"></span></button>';
        html += '</div>';
        html += '<div class="dfm-toolbar-separator"></div>';

        // Search
        html += '<div class="dfm-toolbar-group dfm-search-group">';
        html += '<span class="dashicons dashicons-search dfm-search-icon"></span>';
        html += '<input type="text" id="dfm-search-input" placeholder="Filter files…" autocomplete="off">';
        html += '</div>';

        this.els.toolbar.innerHTML = html;

        // Bind buttons
        document.getElementById('dfm-btn-back').addEventListener('click',         function () { self.goBack(); });
        document.getElementById('dfm-btn-forward').addEventListener('click',      function () { self.goForward(); });
        document.getElementById('dfm-btn-upload').addEventListener('click',       function () { self.showUploadDialog(); });
        document.getElementById('dfm-btn-newfolder').addEventListener('click',    function () { self.showNewFolderDialog(); });
        document.getElementById('dfm-btn-newfile').addEventListener('click',      function () { self.showNewFileDialog(); });
        document.getElementById('dfm-btn-copy').addEventListener('click',         function () { self.clipboardAction('copy'); });
        document.getElementById('dfm-btn-cut').addEventListener('click',          function () { self.clipboardAction('cut'); });
        document.getElementById('dfm-btn-paste').addEventListener('click',        function () { self.pasteItems(); });
        document.getElementById('dfm-btn-rename').addEventListener('click',       function () { self.showRenameDialog(); });
        document.getElementById('dfm-btn-delete').addEventListener('click',       function () { self.showDeleteConfirm(); });
        document.getElementById('dfm-btn-download-sel').addEventListener('click', function () { self.downloadSelection(); });
        document.getElementById('dfm-btn-batch-rename').addEventListener('click', function () { self.showBatchRenameDialog(); });
        document.getElementById('dfm-btn-compress').addEventListener('click',     function () { self.showCompressDialog(); });
        document.getElementById('dfm-btn-bookmark-add').addEventListener('click', function () { self.addBookmark(); });
        document.getElementById('dfm-btn-refresh').addEventListener('click',      function () { self.refresh(); });
        document.getElementById('dfm-btn-grid').addEventListener('click',         function () { self.setView('grid'); });
        document.getElementById('dfm-btn-list').addEventListener('click',         function () { self.setView('list'); });

        document.getElementById('dfm-search-input').addEventListener('input', function () {
            self.searchQuery = this.value.trim().toLowerCase();
            self.renderFileList();
        });
    };

    FileManager.prototype.updateToolbarState = function () {
        var has    = this.selectedItems.length > 0;
        var single = this.selectedItems.length === 1;

        document.getElementById('dfm-btn-copy').disabled         = !has;
        document.getElementById('dfm-btn-cut').disabled          = !has;
        document.getElementById('dfm-btn-paste').disabled        = !this.clipboard;
        document.getElementById('dfm-btn-rename').disabled       = !single;
        document.getElementById('dfm-btn-delete').disabled       = !has;
        document.getElementById('dfm-btn-download-sel').disabled = !has;
        document.getElementById('dfm-btn-batch-rename').disabled = !has;
        document.getElementById('dfm-btn-compress').disabled     = !has;
        this.updateNavButtons();
        this.updateBookmarkButton();
    };

    FileManager.prototype.setView = function (mode) {
        this.viewMode = mode;
        document.getElementById('dfm-btn-grid').classList.toggle('dfm-active', mode === 'grid');
        document.getElementById('dfm-btn-list').classList.toggle('dfm-active', mode === 'list');
        this.renderFileList();
    };

    /* ── Bookmarks ───────────────────────────────────────────── */
    FileManager.prototype.updateBookmarkButton = function () {
        var btn = document.getElementById('dfm-btn-bookmark-add');
        if (!btn) return;
        var bm     = loadBookmarks();
        var active = bm.some(function (b) { return b.path === this.currentPath; }, this);
        var icon   = btn.querySelector('.dashicons');
        if (icon) {
            icon.className = 'dashicons ' + (active ? 'dashicons-star-filled' : 'dashicons-star-empty');
        }
        btn.title = active ? 'Remove bookmark' : 'Bookmark this folder';
    };

    FileManager.prototype.addBookmark = function () {
        var bm   = loadBookmarks();
        var path = this.currentPath;
        var name = path ? path.split('/').pop() : 'Root';
        var idx  = bm.findIndex(function (b) { return b.path === path; });

        if (idx !== -1) {
            bm.splice(idx, 1);
            this.toast('Bookmark removed.', 'info');
        } else {
            bm.push({ path: path, name: name });
            this.toast('Bookmarked: ' + name, 'success');
        }
        saveBookmarks(bm);
        this.updateBookmarkButton();
        this.renderBookmarks();
    };

    FileManager.prototype.renderBookmarks = function () {
        var self = this;
        var bm   = loadBookmarks();
        var el   = document.getElementById('dfm-bookmarks');
        if (!el) return;

        if (bm.length === 0) {
            el.innerHTML = '<div class="dfm-sidebar-empty">No bookmarks yet.</div>';
            return;
        }

        var html = '';
        bm.forEach(function (b) {
            var active = self.currentPath === b.path ? ' dfm-tree-active' : '';
            html += '<div class="dfm-bookmark-item' + active + '" data-path="' + esc(b.path) + '">';
            html += '<span class="dashicons dashicons-star-filled dfm-bookmark-star"></span>';
            html += '<span class="dfm-tree-name">' + esc(b.name || 'Root') + '</span>';
            html += '<span class="dfm-bookmark-remove dashicons dashicons-no-alt" title="Remove"></span>';
            html += '</div>';
        });
        el.innerHTML = html;

        el.querySelectorAll('.dfm-bookmark-item').forEach(function (item) {
            item.addEventListener('click', function (e) {
                if (e.target.classList.contains('dfm-bookmark-remove')) {
                    var path = this.dataset.path;
                    var bm2  = loadBookmarks().filter(function (b) { return b.path !== path; });
                    saveBookmarks(bm2);
                    self.renderBookmarks();
                    self.updateBookmarkButton();
                } else {
                    self.navigate(this.dataset.path);
                }
            });
        });
    };

    /* ── File List Rendering ─────────────────────────────────── */
    FileManager.prototype.getFilteredAndSortedItems = function () {
        var self  = this;
        var items = this.items.slice();

        // Filter by search query
        if (this.searchQuery) {
            var q = this.searchQuery;
            items = items.filter(function (item) {
                return item.name.toLowerCase().indexOf(q) !== -1;
            });
        }

        // Sort
        var key = this.sortKey;
        var dir = this.sortDir;
        items.sort(function (a, b) {
            // Always folders first unless sorting by type
            if (key !== 'type' && a.is_dir !== b.is_dir) {
                return a.is_dir ? -1 : 1;
            }
            var av, bv;
            switch (key) {
                case 'size':     av = a.size || 0;     bv = b.size || 0;     break;
                case 'modified': av = a.modified || 0; bv = b.modified || 0; break;
                case 'type':     av = a.type || '';     bv = b.type || '';    break;
                default:         av = a.name.toLowerCase(); bv = b.name.toLowerCase();
            }
            if (av < bv) return -dir;
            if (av > bv) return dir;
            return 0;
        });

        return items;
    };

    FileManager.prototype.renderFileList = function () {
        var items = this.getFilteredAndSortedItems();

        if (items.length === 0) {
            var msg = this.searchQuery
                ? 'No files match "' + esc(this.searchQuery) + '".'
                : 'This folder is empty';
            this.els.fileList.innerHTML = '<div class="dfm-empty"><span class="dashicons dashicons-portfolio"></span><p>' + msg + '</p></div>';
            return;
        }

        if (this.viewMode === 'grid') {
            this.renderGridView(items);
        } else {
            this.renderListView(items);
        }
    };

    FileManager.prototype.renderGridView = function (items) {
        var self = this;
        var html = '<div class="dfm-grid">';

        items.forEach(function (item, idx) {
            var icon     = getIcon(item);
            var selected = self.isSelected(item) ? ' dfm-selected' : '';
            var thumb    = '';

            if (!item.is_dir && isImageExt(item.type)) {
                thumb = '<img class="dfm-item-thumb" src="' + esc(dfmData.baseUrl + '/' + item.path) + '" alt="" loading="lazy">';
            } else {
                thumb = '<div class="dfm-item-icon"><span class="dashicons ' + icon + '"></span></div>';
            }

            html += '<div class="dfm-grid-item' + selected + '" draggable="true" data-index="' + idx + '" data-path="' + esc(item.path) + '" data-isdir="' + (item.is_dir ? '1' : '0') + '">';
            html += thumb;
            html += '<div class="dfm-item-name">' + esc(item.name) + '</div>';
            html += '</div>';
        });

        html += '</div>';
        this.els.fileList.innerHTML = html;
        this.bindFileListEvents(items);
    };

    FileManager.prototype.renderListView = function (items) {
        var self    = this;
        var sortKey = this.sortKey;
        var sortDir = this.sortDir;

        function thClass(key) {
            if (key !== sortKey) return '';
            return ' class="dfm-sort-active dfm-sort-' + (sortDir === 1 ? 'asc' : 'desc') + '"';
        }

        var html = '<div class="dfm-list"><table>';
        html += '<thead><tr>';
        html += '<th data-sort="name"' + thClass('name') + '>Name</th>';
        html += '<th data-sort="size"' + thClass('size') + '>Size</th>';
        html += '<th data-sort="modified"' + thClass('modified') + '>Modified</th>';
        html += '<th data-sort="type"' + thClass('type') + '>Type</th>';
        html += '<th>Perms</th>';
        html += '</tr></thead>';
        html += '<tbody>';

        items.forEach(function (item, idx) {
            var icon     = getIcon(item);
            var selected = self.isSelected(item) ? ' dfm-selected' : '';

            html += '<tr class="' + selected + '" draggable="true" data-index="' + idx + '" data-path="' + esc(item.path) + '" data-isdir="' + (item.is_dir ? '1' : '0') + '">';
            html += '<td><div class="dfm-list-name"><span class="dashicons ' + icon + '"></span>' + esc(item.name) + '</div></td>';
            html += '<td>' + (item.is_dir ? '—' : formatSize(item.size)) + '</td>';
            html += '<td>' + formatDate(item.modified) + '</td>';
            html += '<td>' + (item.is_dir ? 'Folder' : esc(item.type || '—')) + '</td>';
            html += '<td class="dfm-perms">' + esc(item.perms || '—') + '</td>';
            html += '</tr>';
        });

        html += '</tbody></table></div>';
        this.els.fileList.innerHTML = html;

        // Bind sort headers
        var self2 = this;
        this.els.fileList.querySelectorAll('th[data-sort]').forEach(function (th) {
            th.addEventListener('click', function () {
                var key = this.dataset.sort;
                if (self2.sortKey === key) {
                    self2.sortDir *= -1;
                } else {
                    self2.sortKey = key;
                    self2.sortDir = 1;
                }
                self2.renderFileList();
            });
        });

        this.bindFileListEvents(items);
    };

    FileManager.prototype.bindFileListEvents = function (items) {
        var self     = this;
        var selector = this.viewMode === 'grid' ? '.dfm-grid-item' : '.dfm-list tbody tr';
        var elements = this.els.fileList.querySelectorAll(selector);

        elements.forEach(function (el) {
            var idx  = parseInt(el.dataset.index, 10);
            var item = items[idx];

            el.addEventListener('click', function (e) {
                self.handleItemClick(e, this, items);
            });
            el.addEventListener('dblclick', function () {
                self.handleItemDblClick(this, items);
            });
            el.addEventListener('contextmenu', function (e) {
                e.preventDefault();
                self.handleItemClick(e, this, items);
                self.showContextMenu(e.clientX, e.clientY);
            });

            // Drag start
            el.addEventListener('dragstart', function (e) {
                if (!item) return;
                var dragItems = self.isSelected(item) ? self.selectedItems.slice() : [item];
                self.dragging = { items: dragItems };

                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('application/dfm-items', '1');

                el.classList.add('dfm-dragging');

                if (dragItems.length > 1) {
                    var ghost = document.createElement('div');
                    ghost.className = 'dfm-drag-ghost';
                    ghost.textContent = dragItems.length + ' items';
                    document.body.appendChild(ghost);
                    e.dataTransfer.setDragImage(ghost, 20, 10);
                    setTimeout(function () {
                        if (ghost.parentNode) ghost.parentNode.removeChild(ghost);
                    }, 0);
                }
            });

            el.addEventListener('dragend', function () {
                self.dragging = null;
                el.classList.remove('dfm-dragging');
                self.els.fileList.querySelectorAll('.dfm-drop-target').forEach(function (t) {
                    t.classList.remove('dfm-drop-target');
                });
            });

            if (item && item.is_dir) {
                el.addEventListener('dragover', function (e) {
                    if (!self.dragging) return;
                    if (self.dragging.items.some(function (i) { return i.path === item.path; })) return;
                    e.preventDefault();
                    e.stopPropagation();
                    e.dataTransfer.dropEffect = 'move';
                    el.classList.add('dfm-drop-target');
                });

                el.addEventListener('dragleave', function (e) {
                    if (!el.contains(e.relatedTarget)) {
                        el.classList.remove('dfm-drop-target');
                    }
                });

                el.addEventListener('drop', function (e) {
                    e.preventDefault();
                    e.stopPropagation();
                    el.classList.remove('dfm-drop-target');
                    if (!self.dragging) return;
                    var dragItems = self.dragging.items.filter(function (i) { return i.path !== item.path; });
                    self.dragging = null;
                    if (dragItems.length === 0) return;
                    self.moveItems(dragItems, item.path);
                });
            }
        });

        this.els.fileList.addEventListener('click', function (e) {
            if (e.target === self.els.fileList ||
                e.target.classList.contains('dfm-grid') ||
                e.target.tagName === 'TBODY') {
                self.selectedItems    = [];
                self.lastClickedIndex = -1;
                self.renderFileList();
                self.updateToolbarState();
            }
        });

        this.els.fileList.addEventListener('contextmenu', function (e) {
            if (e.target === self.els.fileList ||
                e.target.classList.contains('dfm-grid') ||
                e.target.tagName === 'TBODY') {
                e.preventDefault();
                self.selectedItems = [];
                self.showContextMenu(e.clientX, e.clientY);
            }
        });
    };

    /* ── Selection ───────────────────────────────────────────── */
    FileManager.prototype.isSelected = function (item) {
        return this.selectedItems.some(function (s) { return s.path === item.path; });
    };

    FileManager.prototype.handleItemClick = function (e, el, items) {
        var idx  = parseInt(el.dataset.index, 10);
        var item = items[idx];
        if (!item) return;

        if (e.ctrlKey || e.metaKey) {
            if (this.isSelected(item)) {
                this.selectedItems = this.selectedItems.filter(function (s) { return s.path !== item.path; });
            } else {
                this.selectedItems.push(item);
            }
        } else if (e.shiftKey && this.lastClickedIndex >= 0) {
            var start = Math.min(this.lastClickedIndex, idx);
            var end   = Math.max(this.lastClickedIndex, idx);
            this.selectedItems = [];
            for (var i = start; i <= end; i++) {
                this.selectedItems.push(items[i]);
            }
        } else {
            this.selectedItems = [item];
        }

        this.lastClickedIndex = idx;
        this.renderFileList();
        this.updateToolbarState();
    };

    FileManager.prototype.handleItemDblClick = function (el, items) {
        var idx  = parseInt(el.dataset.index, 10);
        var item = items[idx];
        if (!item) return;

        if (item.is_dir) {
            this.navigate(item.path);
        } else {
            this.previewFile(item);
        }
    };

    /* ── Folder Tree ─────────────────────────────────────────── */
    FileManager.prototype.loadTree = function () {
        var self = this;
        this.ajax({ action_type: 'tree', path: '' }, function (ok, data) {
            if (ok) {
                self.renderTree(data.tree || []);
            }
        });
    };

    FileManager.prototype.renderTree = function (tree) {
        var self = this;
        var html = '';
        html += '<div class="dfm-sidebar-section-header">Folders</div>';
        html += '<div class="dfm-tree-node">';
        html += '<div class="dfm-tree-label' + (self.currentPath === '' ? ' dfm-tree-active' : '') + '" data-path="" data-has-children="0">';
        html += '<span class="dfm-tree-toggle"><span class="dashicons dashicons-arrow-down"></span></span>';
        html += '<span class="dfm-tree-icon"><span class="dashicons dashicons-category"></span></span>';
        html += '<span class="dfm-tree-name">Root</span>';
        html += '</div>';
        html += '<div class="dfm-tree-children">';
        html += this.buildTreeHTML(tree);
        html += '</div></div>';

        // Bookmarks section
        html += '<div class="dfm-sidebar-section-header dfm-bookmarks-header">Bookmarks</div>';
        html += '<div id="dfm-bookmarks"></div>';

        this.els.tree.innerHTML = html;
        this.bindTreeEvents();
        this.renderBookmarks();
    };

    FileManager.prototype.buildTreeHTML = function (nodes) {
        var self = this;
        var html = '';

        nodes.forEach(function (node) {
            var hasChildren = node.has_children || (node.children && node.children.length > 0);
            var isActive    = self.currentPath === node.path;

            html += '<div class="dfm-tree-node">';
            html += '<div class="dfm-tree-label' + (isActive ? ' dfm-tree-active' : '') + '" data-path="' + esc(node.path) + '" data-has-children="' + (hasChildren ? '1' : '0') + '">';
            html += '<span class="dfm-tree-toggle">';
            if (hasChildren) {
                html += '<span class="dashicons dashicons-arrow-right"></span>';
            }
            html += '</span>';
            html += '<span class="dfm-tree-icon"><span class="dashicons dashicons-category"></span></span>';
            html += '<span class="dfm-tree-name">' + esc(node.name) + '</span>';
            html += '</div>';

            if (node.children && node.children.length > 0) {
                html += '<div class="dfm-tree-children dfm-collapsed">';
                html += self.buildTreeHTML(node.children);
                html += '</div>';
            }

            html += '</div>';
        });

        return html;
    };

    FileManager.prototype.bindTreeEvents = function () {
        var self = this;
        var tree = this.els.tree;

        // Remove previous delegated handlers before re-binding (called on each loadTree).
        if (this._treeHandlers) {
            tree.removeEventListener('click',    this._treeHandlers.click);
            tree.removeEventListener('dragover', this._treeHandlers.dragover);
            tree.removeEventListener('dragleave',this._treeHandlers.dragleave);
            tree.removeEventListener('drop',     this._treeHandlers.drop);
        }

        var h = {};

        h.click = function (e) {
            var label = e.target.closest('.dfm-tree-label');
            if (!label) return;

            var path        = label.dataset.path;
            var toggle      = label.querySelector('.dfm-tree-toggle .dashicons');
            var childrenDiv = label.nextElementSibling;
            var hasChildren = label.dataset.hasChildren === '1';

            if (toggle) {
                if (childrenDiv && childrenDiv.classList.contains('dfm-tree-children')) {
                    // Toggle already-loaded children.
                    childrenDiv.classList.toggle('dfm-collapsed');
                    toggle.classList.toggle('dashicons-arrow-right');
                    toggle.classList.toggle('dashicons-arrow-down');
                } else if (hasChildren) {
                    // Lazy-load children for this node.
                    label.dataset.hasChildren = '0'; // prevent duplicate fetch
                    self.ajax({ action_type: 'tree', path: path }, function (ok, data) {
                        if (!ok || !data.tree || data.tree.length === 0) return;
                        var div = document.createElement('div');
                        div.className = 'dfm-tree-children';
                        div.innerHTML = self.buildTreeHTML(data.tree);
                        label.parentNode.insertBefore(div, label.nextSibling);
                        toggle.classList.remove('dashicons-arrow-right');
                        toggle.classList.add('dashicons-arrow-down');
                    });
                }
            }

            self.navigate(path);
        };

        h.dragover = function (e) {
            var label = e.target.closest('.dfm-tree-label');
            if (!label || !self.dragging) return;
            var targetPath = label.dataset.path;
            if (self.dragging.items.some(function (i) { return i.path === targetPath; })) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            label.classList.add('dfm-drop-target');
        };

        h.dragleave = function (e) {
            var label = e.target.closest('.dfm-tree-label');
            if (label) label.classList.remove('dfm-drop-target');
        };

        h.drop = function (e) {
            var label = e.target.closest('.dfm-tree-label');
            if (!label) return;
            e.preventDefault();
            label.classList.remove('dfm-drop-target');
            if (!self.dragging) return;
            var targetPath = label.dataset.path;
            var dragItems  = self.dragging.items.filter(function (i) { return i.path !== targetPath; });
            self.dragging  = null;
            if (dragItems.length === 0) return;
            self.moveItems(dragItems, targetPath);
        };

        tree.addEventListener('click',    h.click);
        tree.addEventListener('dragover', h.dragover);
        tree.addEventListener('dragleave',h.dragleave);
        tree.addEventListener('drop',     h.drop);

        this._treeHandlers = h;
    };

    FileManager.prototype.highlightTreeNode = function (path) {
        this.els.tree.querySelectorAll('.dfm-tree-label').forEach(function (el) {
            el.classList.toggle('dfm-tree-active', el.dataset.path === path);
        });
        this.renderBookmarks();
        this.updateBookmarkButton();
    };

    /* ── Context Menu ────────────────────────────────────────── */
    FileManager.prototype.showContextMenu = function (x, y) {
        var self            = this;
        var hasSelection    = this.selectedItems.length > 0;
        var singleSelection = this.selectedItems.length === 1;
        var html            = '';

        if (hasSelection) {
            var item = singleSelection ? this.selectedItems[0] : null;

            if (singleSelection && item.is_dir) {
                html += '<div class="dfm-ctx-item" data-action="open"><span class="dashicons dashicons-open-folder"></span>Open</div>';
                html += '<div class="dfm-ctx-separator"></div>';
            }
            if (singleSelection && !item.is_dir) {
                html += '<div class="dfm-ctx-item" data-action="preview"><span class="dashicons dashicons-visibility"></span>Preview</div>';
                html += '<div class="dfm-ctx-item" data-action="edit"><span class="dashicons dashicons-edit-page"></span>Edit</div>';
                html += '<div class="dfm-ctx-item" data-action="download"><span class="dashicons dashicons-download"></span>Download</div>';
                if (isZipExt(item.type)) {
                    html += '<div class="dfm-ctx-item" data-action="extract"><span class="dashicons dashicons-archive"></span>Extract Here</div>';
                }
                html += '<div class="dfm-ctx-separator"></div>';
            }
            if (singleSelection && item.is_dir) {
                html += '<div class="dfm-ctx-item" data-action="download-folder"><span class="dashicons dashicons-download"></span>Download as ZIP</div>';
            }
            if (!singleSelection) {
                html += '<div class="dfm-ctx-item" data-action="download-multi"><span class="dashicons dashicons-download"></span>Download as ZIP</div>';
            }
            html += '<div class="dfm-ctx-separator"></div>';
            html += '<div class="dfm-ctx-item" data-action="copy"><span class="dashicons dashicons-admin-page"></span>Copy</div>';
            html += '<div class="dfm-ctx-item" data-action="cut"><span class="dashicons dashicons-scissors"></span>Cut</div>';
            if (this.clipboard) {
                html += '<div class="dfm-ctx-item" data-action="paste"><span class="dashicons dashicons-clipboard"></span>Paste</div>';
            }
            html += '<div class="dfm-ctx-separator"></div>';
            if (singleSelection) {
                html += '<div class="dfm-ctx-item" data-action="rename"><span class="dashicons dashicons-edit"></span>Rename</div>';
                html += '<div class="dfm-ctx-item" data-action="duplicate"><span class="dashicons dashicons-admin-page"></span>Duplicate</div>';
            }
            html += '<div class="dfm-ctx-item" data-action="compress"><span class="dashicons dashicons-archive"></span>Compress to ZIP</div>';
            html += '<div class="dfm-ctx-item" data-action="batch-rename"><span class="dashicons dashicons-tag"></span>Batch Rename</div>';
            html += '<div class="dfm-ctx-separator"></div>';
            if (singleSelection) {
                html += '<div class="dfm-ctx-item" data-action="properties"><span class="dashicons dashicons-info"></span>Properties</div>';
                if (!item.is_dir) {
                    html += '<div class="dfm-ctx-item" data-action="copy-url"><span class="dashicons dashicons-admin-links"></span>Copy URL</div>';
                }
                html += '<div class="dfm-ctx-item" data-action="copy-path"><span class="dashicons dashicons-clipboard"></span>Copy Path</div>';
            }
            html += '<div class="dfm-ctx-separator"></div>';
            html += '<div class="dfm-ctx-item dfm-ctx-danger" data-action="delete"><span class="dashicons dashicons-trash"></span>Delete</div>';
        } else {
            html += '<div class="dfm-ctx-item" data-action="upload"><span class="dashicons dashicons-upload"></span>Upload</div>';
            html += '<div class="dfm-ctx-item" data-action="newfolder"><span class="dashicons dashicons-plus-alt"></span>New Folder</div>';
            html += '<div class="dfm-ctx-item" data-action="newfile"><span class="dashicons dashicons-media-default"></span>New File</div>';
            if (this.clipboard) {
                html += '<div class="dfm-ctx-separator"></div>';
                html += '<div class="dfm-ctx-item" data-action="paste"><span class="dashicons dashicons-clipboard"></span>Paste</div>';
            }
            html += '<div class="dfm-ctx-separator"></div>';
            html += '<div class="dfm-ctx-item" data-action="refresh"><span class="dashicons dashicons-update"></span>Refresh</div>';
        }

        this.els.contextMenu.innerHTML = html;
        this.els.contextMenu.style.left = x + 'px';
        this.els.contextMenu.style.top  = y + 'px';
        this.els.contextMenu.classList.add('dfm-visible');

        var rect = this.els.contextMenu.getBoundingClientRect();
        if (rect.right > window.innerWidth) {
            this.els.contextMenu.style.left = (x - rect.width) + 'px';
        }
        if (rect.bottom > window.innerHeight) {
            this.els.contextMenu.style.top = (y - rect.height) + 'px';
        }

        this.els.contextMenu.querySelectorAll('.dfm-ctx-item').forEach(function (el) {
            el.addEventListener('click', function () {
                var action = this.dataset.action;
                self.hideContextMenu();
                self.handleContextAction(action);
            });
        });
    };

    FileManager.prototype.hideContextMenu = function () {
        this.els.contextMenu.classList.remove('dfm-visible');
    };

    FileManager.prototype.handleContextAction = function (action) {
        switch (action) {
            case 'open':
                if (this.selectedItems.length === 1 && this.selectedItems[0].is_dir) {
                    this.navigate(this.selectedItems[0].path);
                }
                break;
            case 'preview':
                if (this.selectedItems.length === 1) this.previewFile(this.selectedItems[0]);
                break;
            case 'edit':
                if (this.selectedItems.length === 1) this.editFile(this.selectedItems[0]);
                break;
            case 'download':
                if (this.selectedItems.length === 1) this.downloadFile(this.selectedItems[0]);
                break;
            case 'download-folder':
            case 'download-multi':
                this.downloadSelection();
                break;
            case 'extract':
                if (this.selectedItems.length === 1) this.extractFile(this.selectedItems[0]);
                break;
            case 'copy':
                this.clipboardAction('copy');
                break;
            case 'cut':
                this.clipboardAction('cut');
                break;
            case 'paste':
                this.pasteItems();
                break;
            case 'rename':
                this.showRenameDialog();
                break;
            case 'duplicate':
                if (this.selectedItems.length === 1) this.duplicateItem(this.selectedItems[0]);
                break;
            case 'compress':
                this.showCompressDialog();
                break;
            case 'batch-rename':
                this.showBatchRenameDialog();
                break;
            case 'delete':
                this.showDeleteConfirm();
                break;
            case 'upload':
                this.showUploadDialog();
                break;
            case 'newfolder':
                this.showNewFolderDialog();
                break;
            case 'newfile':
                this.showNewFileDialog();
                break;
            case 'properties':
                if (this.selectedItems.length === 1) this.showPropertiesDialog(this.selectedItems[0]);
                break;
            case 'copy-url':
                if (this.selectedItems.length === 1) this.copyItemUrl(this.selectedItems[0]);
                break;
            case 'copy-path':
                if (this.selectedItems.length === 1) this.copyItemPath(this.selectedItems[0]);
                break;
            case 'refresh':
                this.refresh();
                break;
        }
    };

    /* ── Clipboard ───────────────────────────────────────────── */
    FileManager.prototype.clipboardAction = function (op) {
        if (this.selectedItems.length === 0) return;
        this.clipboard = { items: this.selectedItems.slice(), operation: op };
        this.toast(this.selectedItems.length + ' item(s) ' + (op === 'copy' ? 'copied' : 'cut') + '.', 'info');
        this.updateToolbarState();
    };

    FileManager.prototype.pasteItems = function () {
        if (!this.clipboard) return;
        var self      = this;
        var op        = this.clipboard.operation === 'copy' ? 'copy' : 'move';
        var items     = this.clipboard.items;
        var completed = 0;
        var errors    = [];
        var conflicts = []; // items that returned 'exists' error

        function finish() {
            if (errors.length) {
                self.toast(errors.join('; '), 'error');
            } else {
                self.toast(items.length + ' item(s) ' + (op === 'copy' ? 'copied' : 'moved') + '.', 'success');
            }
            if (op === 'move') self.clipboard = null;
            self.refresh();
            self.loadTree();
        }

        function tryItem(item, overwrite) {
            self.ajax({
                action_type: op,
                source: item.path,
                destination: self.currentPath,
                overwrite: overwrite ? 'true' : 'false'
            }, function (ok, data) {
                completed++;
                if (!ok) {
                    if (!overwrite && data.code === 'exists') {
                        conflicts.push(item);
                    } else {
                        errors.push(data.message);
                    }
                }
                if (completed === items.length) {
                    if (conflicts.length > 0) {
                        self.showOverwritePrompt(conflicts, op, function (overwriteAll) {
                            if (overwriteAll) {
                                var c2 = 0;
                                conflicts.forEach(function (ci) {
                                    self.ajax({
                                        action_type: op,
                                        source: ci.path,
                                        destination: self.currentPath,
                                        overwrite: 'true'
                                    }, function (ok2, d2) {
                                        c2++;
                                        if (!ok2) errors.push(d2.message);
                                        if (c2 === conflicts.length) finish();
                                    });
                                });
                            } else {
                                finish();
                            }
                        });
                    } else {
                        finish();
                    }
                }
            });
        }

        items.forEach(function (item) { tryItem(item, false); });
    };

    FileManager.prototype.showOverwritePrompt = function (conflicts, op, callback) {
        var self  = this;
        var names = conflicts.map(function (i) { return i.name; });
        var body  = '<p>The following ' + names.length + ' item(s) already exist in the destination:</p>';
        body += '<ul style="margin:8px 0;padding-left:20px;">';
        names.forEach(function (n) { body += '<li>' + esc(n) + '</li>'; });
        body += '</ul>';
        body += '<p>Do you want to replace them?</p>';

        var footer = '<button class="dfm-btn-cancel">Skip</button><button class="dfm-btn-danger" id="dfm-btn-overwrite">Replace</button>';
        // onClose fires callback(false) when dismissed via Escape, ×, or backdrop click.
        this.showModal('Replace existing files?', body, footer, function () { callback(false); });

        document.getElementById('dfm-btn-overwrite').addEventListener('click', function () {
            self._modalOnClose = null; // prevent onClose from firing callback(false)
            self.hideModal();
            callback(true);
        });
        this.els.modal.querySelector('.dfm-btn-cancel').addEventListener('click', function () {
            self.hideModal(); // triggers onClose → callback(false)
        });
    };

    /* ── Move (drag & drop) ──────────────────────────────────── */
    FileManager.prototype.moveItems = function (items, destPath) {
        var self      = this;
        var completed = 0;
        var errors    = [];
        var conflicts = [];

        function finish() {
            if (errors.length) {
                self.toast(errors.join('; '), 'error');
            } else {
                self.toast(items.length + ' item(s) moved.', 'success');
            }
            self.selectedItems = [];
            self.refresh();
            self.loadTree();
        }

        function doMove(item, overwrite) {
            self.ajax({
                action_type: 'move',
                source: item.path,
                destination: destPath,
                overwrite: overwrite ? 'true' : 'false'
            }, function (ok, data) {
                completed++;
                if (!ok) {
                    if (!overwrite && data.code === 'exists') {
                        conflicts.push(item);
                    } else {
                        errors.push(data.message || item.name);
                    }
                }
                if (completed === items.length) {
                    if (conflicts.length > 0) {
                        self.showOverwritePrompt(conflicts, 'move', function (overwriteAll) {
                            if (overwriteAll) {
                                var c2 = 0;
                                conflicts.forEach(function (ci) {
                                    self.ajax({
                                        action_type: 'move',
                                        source: ci.path,
                                        destination: destPath,
                                        overwrite: 'true'
                                    }, function (ok2, d2) {
                                        c2++;
                                        if (!ok2) errors.push(d2.message || ci.name);
                                        if (c2 === conflicts.length) finish();
                                    });
                                });
                            } else {
                                finish();
                            }
                        });
                    } else {
                        finish();
                    }
                }
            });
        }

        items.forEach(function (item) { doMove(item, false); });
    };

    /* ── File Operations ─────────────────────────────────────── */
    FileManager.prototype.refresh = function () {
        this.navigateInternal(this.currentPath);
    };

    FileManager.prototype.downloadFile = function (item) {
        var url = dfmData.ajaxUrl + '?action=dfm_action&action_type=download&nonce=' +
            encodeURIComponent(dfmData.nonce) + '&path=' + encodeURIComponent(item.path);
        var a = document.createElement('a');
        a.href = url;
        a.download = item.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    FileManager.prototype.downloadSelection = function () {
        if (this.selectedItems.length === 0) return;

        // Single file — use direct download
        if (this.selectedItems.length === 1 && !this.selectedItems[0].is_dir) {
            this.downloadFile(this.selectedItems[0]);
            return;
        }

        var self  = this;
        var paths = this.selectedItems.map(function (i) { return i.path; });
        this.toast('Preparing download…', 'info');

        this.ajax({ action_type: 'prepare_zip', paths: paths }, function (ok, data) {
            if (!ok) {
                self.toast(data.message || 'Failed to prepare download.', 'error');
                return;
            }
            var url = dfmData.ajaxUrl + '?action=dfm_action&action_type=download_zip&nonce=' +
                encodeURIComponent(dfmData.nonce) + '&key=' + encodeURIComponent(data.key);
            var a = document.createElement('a');
            a.href = url;
            a.download = 'download.zip';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        });
    };

    FileManager.prototype.duplicateItem = function (item) {
        var self = this;
        this.ajax({ action_type: 'duplicate', path: item.path }, function (ok, data) {
            if (ok) {
                self.toast('Duplicated: ' + item.name, 'success');
                self.refresh();
            } else {
                self.toast(data.message || 'Duplicate failed.', 'error');
            }
        });
    };

    FileManager.prototype.extractFile = function (item) {
        var self = this;
        var dest = item.path.split('/').slice(0, -1).join('/') || '';
        this.toast('Extracting…', 'info');
        this.ajax({ action_type: 'extract', path: item.path, destination: dest }, function (ok, data) {
            if (ok) {
                self.toast('Extracted to: ' + data.path, 'success');
                self.refresh();
                self.loadTree();
            } else {
                self.toast(data.message || 'Extraction failed.', 'error');
            }
        });
    };

    FileManager.prototype.copyItemUrl = function (item) {
        var self = this;
        this.ajax({ action_type: 'preview', path: item.path }, function (ok, data) {
            var url = (ok && data.url) ? data.url : (dfmData.baseUrl + '/' + item.path);
            copyToClipboard(url).then(function () {
                self.toast('URL copied to clipboard.', 'success');
            }).catch(function () {
                self.toast('Could not copy URL.', 'error');
            });
        });
    };

    FileManager.prototype.copyItemPath = function (item) {
        var self = this;
        copyToClipboard(item.path).then(function () {
            self.toast('Path copied to clipboard.', 'success');
        }).catch(function () {
            self.toast('Could not copy path.', 'error');
        });
    };

    FileManager.prototype.previewFile = function (item) {
        var self = this;
        this.ajax({ action_type: 'preview', path: item.path }, function (ok, data) {
            if (!ok) {
                self.toast(data.message || 'Cannot preview file.', 'error');
                return;
            }
            self.showPreviewModal(data);
        });
    };

    FileManager.prototype.editFile = function (item) {
        var self = this;
        this.ajax({ action_type: 'preview', path: item.path }, function (ok, data) {
            if (!ok) {
                self.toast(data.message || 'Cannot open file for editing.', 'error');
                return;
            }
            if (data.preview_type !== 'text') {
                self.toast('Only text-based files can be edited.', 'error');
                return;
            }
            self.showEditModal(item, data);
        });
    };

    FileManager.prototype.showEditModal = function (item, data) {
        var self = this;
        var body = '<textarea id="dfm-editor" class="dfm-editor-textarea">' + esc(data.content) + '</textarea>';
        body += '<div class="dfm-preview-info">' + esc(data.name) + ' &middot; ' + formatSize(data.size) + '</div>';
        var footer = '<button class="dfm-btn-cancel">Cancel</button><button class="dfm-btn-primary" id="dfm-btn-save-file">Save</button>';
        this.showModal('Edit: ' + data.name, body, footer);

        this.els.modal.style.width    = '80vw';
        this.els.modal.style.maxWidth = '1000px';

        var textarea = document.getElementById('dfm-editor');
        textarea.addEventListener('keydown', function (e) {
            if (e.key === 'Tab') {
                e.preventDefault();
                var start   = this.selectionStart;
                var end     = this.selectionEnd;
                this.value  = this.value.substring(0, start) + '\t' + this.value.substring(end);
                this.selectionStart = this.selectionEnd = start + 1;
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                document.getElementById('dfm-btn-save-file').click();
            }
        });

        document.getElementById('dfm-btn-save-file').addEventListener('click', function () {
            var content = textarea.value;
            self.ajax({ action_type: 'save', path: item.path, content: content }, function (ok, resp) {
                if (ok) {
                    self.toast('File saved.', 'success');
                    self.hideModal();
                    self.els.modal.style.width = '';
                    self.els.modal.style.maxWidth = '';
                } else {
                    self.toast(resp.message || 'Failed to save file.', 'error');
                }
            });
        });

        this.els.modal.querySelector('.dfm-btn-cancel').addEventListener('click', function () {
            self.hideModal();
            self.els.modal.style.width = '';
            self.els.modal.style.maxWidth = '';
        });
    };

    /* ── Modals ──────────────────────────────────────────────── */
    FileManager.prototype.showModal = function (title, bodyHTML, footerHTML, onClose) {
        var html = '<div class="dfm-modal-header"><h2>' + esc(title) + '</h2><button class="dfm-modal-close">&times;</button></div>';
        html += '<div class="dfm-modal-body">' + bodyHTML + '</div>';
        if (footerHTML) {
            html += '<div class="dfm-modal-footer">' + footerHTML + '</div>';
        }

        this._modalOnClose = onClose || null;

        this.els.modal.innerHTML = html;
        this.els.modal.classList.add('dfm-visible');
        this.els.backdrop.classList.add('dfm-visible');

        var self = this;
        this.els.modal.querySelector('.dfm-modal-close').addEventListener('click', function () { self.hideModal(); });

        if (this._backdropHandler) {
            this.els.backdrop.removeEventListener('click', this._backdropHandler);
        }
        this._backdropHandler = function () { self.hideModal(); };
        this.els.backdrop.addEventListener('click', this._backdropHandler);

        var input = this.els.modal.querySelector('input[type="text"]');
        if (input) {
            setTimeout(function () { input.focus(); input.select(); }, 100);
        }
    };

    FileManager.prototype.hideModal = function () {
        var onClose = this._modalOnClose;
        this._modalOnClose = null;
        this.els.modal.classList.remove('dfm-visible');
        this.els.backdrop.classList.remove('dfm-visible');
        this.els.modal.innerHTML = '';
        if (onClose) onClose();
    };

    FileManager.prototype.showNewFolderDialog = function () {
        var self   = this;
        var body   = '<label>Folder name:</label><input type="text" id="dfm-input-foldername" value="New Folder">';
        var footer = '<button class="dfm-btn-cancel">Cancel</button><button class="dfm-btn-primary" id="dfm-btn-create-folder">Create</button>';
        this.showModal('New Folder', body, footer);

        var input = document.getElementById('dfm-input-foldername');

        document.getElementById('dfm-btn-create-folder').addEventListener('click', function () {
            var name = input.value.trim();
            if (!name) return;
            self.hideModal();
            self.ajax({ action_type: 'create_folder', path: self.currentPath, name: name }, function (ok, data) {
                if (ok) {
                    self.toast('Folder created.', 'success');
                    self.refresh();
                    self.loadTree();
                } else {
                    self.toast(data.message || 'Failed to create folder.', 'error');
                }
            });
        });

        input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') document.getElementById('dfm-btn-create-folder').click();
        });

        this.els.modal.querySelector('.dfm-btn-cancel').addEventListener('click', function () { self.hideModal(); });
    };

    FileManager.prototype.showNewFileDialog = function () {
        var self   = this;
        var body   = '<label>File name:</label><input type="text" id="dfm-input-filename" value="new-file.txt">';
        var footer = '<button class="dfm-btn-cancel">Cancel</button><button class="dfm-btn-primary" id="dfm-btn-create-file">Create</button>';
        this.showModal('New File', body, footer);

        var input = document.getElementById('dfm-input-filename');

        document.getElementById('dfm-btn-create-file').addEventListener('click', function () {
            var name = input.value.trim();
            if (!name) return;
            self.hideModal();
            self.ajax({ action_type: 'create_file', path: self.currentPath, name: name }, function (ok, data) {
                if (ok) {
                    self.toast('File created.', 'success');
                    self.refresh();
                } else {
                    self.toast(data.message || 'Failed to create file.', 'error');
                }
            });
        });

        input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') document.getElementById('dfm-btn-create-file').click();
        });

        this.els.modal.querySelector('.dfm-btn-cancel').addEventListener('click', function () { self.hideModal(); });
    };

    FileManager.prototype.showRenameDialog = function () {
        if (this.selectedItems.length !== 1) return;
        var self   = this;
        var item   = this.selectedItems[0];
        var body   = '<label>New name:</label><input type="text" id="dfm-input-rename" value="' + esc(item.name) + '">';
        var footer = '<button class="dfm-btn-cancel">Cancel</button><button class="dfm-btn-primary" id="dfm-btn-do-rename">Rename</button>';
        this.showModal('Rename', body, footer);

        var input = document.getElementById('dfm-input-rename');

        if (!item.is_dir) {
            var dotIdx = item.name.lastIndexOf('.');
            if (dotIdx > 0) {
                setTimeout(function () { input.setSelectionRange(0, dotIdx); }, 100);
            }
        }

        document.getElementById('dfm-btn-do-rename').addEventListener('click', function () {
            var newName = input.value.trim();
            if (!newName || newName === item.name) { self.hideModal(); return; }
            self.hideModal();
            self.ajax({ action_type: 'rename', path: item.path, new_name: newName }, function (ok, data) {
                if (ok) {
                    self.toast('Renamed successfully.', 'success');
                    self.refresh();
                    self.loadTree();
                } else {
                    self.toast(data.message || 'Rename failed.', 'error');
                }
            });
        });

        input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') document.getElementById('dfm-btn-do-rename').click();
        });

        this.els.modal.querySelector('.dfm-btn-cancel').addEventListener('click', function () { self.hideModal(); });
    };

    FileManager.prototype.showDeleteConfirm = function () {
        if (this.selectedItems.length === 0) return;
        var self  = this;
        var names = this.selectedItems.map(function (i) { return i.name; });
        var body  = '<p>Are you sure you want to delete the following ' + names.length + ' item(s)?</p>';
        body += '<ul style="margin:10px 0;padding-left:20px;">';
        names.forEach(function (n) { body += '<li>' + esc(n) + '</li>'; });
        body += '</ul>';
        body += '<p style="color:#d63638;font-size:12px;">This action cannot be undone.</p>';
        var footer = '<button class="dfm-btn-cancel">Cancel</button><button class="dfm-btn-danger" id="dfm-btn-do-delete">Delete</button>';
        this.showModal('Confirm Delete', body, footer);

        document.getElementById('dfm-btn-do-delete').addEventListener('click', function () {
            self.hideModal();
            var paths = self.selectedItems.map(function (i) { return i.path; });
            self.ajax({ action_type: 'delete', paths: paths }, function (ok, data) {
                if (ok) {
                    self.toast(data.message || 'Deleted.', 'success');
                    self.selectedItems = [];
                    self.refresh();
                    self.loadTree();
                } else {
                    self.toast(data.message || 'Delete failed.', 'error');
                }
            });
        });

        this.els.modal.querySelector('.dfm-btn-cancel').addEventListener('click', function () { self.hideModal(); });
    };

    FileManager.prototype.showUploadDialog = function () {
        var self = this;
        var body = '<label>Select files to upload:</label>';
        body += '<input type="file" id="dfm-input-files" multiple style="margin-top:8px;display:block;width:100%;">';
        body += '<label style="display:flex;align-items:center;gap:8px;margin-top:12px;font-weight:normal;">';
        body += '<input type="checkbox" id="dfm-upload-overwrite"> Replace existing files with the same name';
        body += '</label>';
        body += '<p style="margin-top:10px;font-size:12px;color:#787c82;">Max upload size: ' + formatSize(dfmData.maxUploadSize) + '. You can also drag & drop files onto the file list.</p>';
        var footer = '<button class="dfm-btn-cancel">Cancel</button><button class="dfm-btn-primary" id="dfm-btn-do-upload">Upload</button>';
        this.showModal('Upload Files', body, footer);

        document.getElementById('dfm-btn-do-upload').addEventListener('click', function () {
            var fileInput = document.getElementById('dfm-input-files');
            if (!fileInput.files.length) return;
            var files     = fileInput.files;
            var overwrite = document.getElementById('dfm-upload-overwrite').checked;
            self.hideModal();

            if (overwrite) {
                // Checkbox explicitly checked — replace without prompting.
                self.uploadFiles(files, true);
                return;
            }

            // Check for conflicts against current directory and prompt if found.
            var existingNames = self.items.map(function (i) { return i.name.toLowerCase(); });
            var conflicts = [];
            for (var i = 0; i < files.length; i++) {
                if (existingNames.indexOf(files[i].name.toLowerCase()) !== -1) {
                    conflicts.push(files[i].name);
                }
            }
            if (conflicts.length > 0) {
                self.showUploadConflictPrompt(files, conflicts);
            } else {
                self.uploadFiles(files, false);
            }
        });

        this.els.modal.querySelector('.dfm-btn-cancel').addEventListener('click', function () { self.hideModal(); });
    };

    FileManager.prototype.showUploadConflictPrompt = function (files, conflicts) {
        var self = this;
        var body = '<p>The following ' + conflicts.length + ' file(s) already exist in this folder:</p>';
        body += '<ul style="margin:8px 0;padding-left:20px;">';
        conflicts.forEach(function (n) { body += '<li>' + esc(n) + '</li>'; });
        body += '</ul>';
        body += '<p>Do you want to replace them?</p>';

        var footer = '<button class="dfm-btn-cancel">Keep Both</button>';
        footer += '<button class="dfm-btn-danger" id="dfm-btn-upload-replace">Replace</button>';

        // Dismissed via Escape / × / backdrop → keep both (auto-rename).
        this.showModal('Replace existing files?', body, footer, function () {
            self.uploadFiles(files, false);
        });

        document.getElementById('dfm-btn-upload-replace').addEventListener('click', function () {
            self._modalOnClose = null;
            self.hideModal();
            self.uploadFiles(files, true);
        });
        this.els.modal.querySelector('.dfm-btn-cancel').addEventListener('click', function () {
            self.hideModal(); // onClose fires → uploadFiles(files, false)
        });
    };

    FileManager.prototype.uploadFiles = function (files, overwrite) {
        var self = this;
        var fd   = new FormData();
        fd.append('action', 'dfm_action');
        fd.append('nonce', dfmData.nonce);
        fd.append('action_type', 'upload');
        fd.append('path', this.currentPath);
        fd.append('overwrite', overwrite ? 'true' : 'false');

        for (var i = 0; i < files.length; i++) {
            fd.append('files[]', files[i]);
        }

        this.toast('Uploading ' + files.length + ' file(s)…', 'info');

        var xhr = new XMLHttpRequest();
        xhr.open('POST', dfmData.ajaxUrl, true);
        xhr.onreadystatechange = function () {
            if (xhr.readyState !== 4) return;
            try {
                var resp = JSON.parse(xhr.responseText);
                if (resp.success) {
                    self.toast(resp.data.message || 'Upload complete.', 'success');
                } else {
                    self.toast(resp.data.message || 'Upload failed.', 'error');
                }
            } catch (e) {
                self.toast('Upload failed.', 'error');
            }
            self.refresh();
        };
        xhr.send(fd);
    };

    FileManager.prototype.showCompressDialog = function () {
        if (this.selectedItems.length === 0) return;
        var self  = this;
        var names = this.selectedItems.map(function (i) { return i.name; });
        var defaultName = (names.length === 1 ? names[0] : 'archive');

        var body = '<label>Archive name:</label>';
        body += '<input type="text" id="dfm-input-archive-name" value="' + esc(defaultName) + '">';
        body += '<p style="margin-top:8px;font-size:12px;color:#787c82;">';
        body += 'Will be created in the current folder. ".zip" will be appended automatically.</p>';

        var footer = '<button class="dfm-btn-cancel">Cancel</button><button class="dfm-btn-primary" id="dfm-btn-do-compress">Compress</button>';
        this.showModal('Compress to ZIP', body, footer);

        var input = document.getElementById('dfm-input-archive-name');

        document.getElementById('dfm-btn-do-compress').addEventListener('click', function () {
            var archiveName = input.value.trim();
            if (!archiveName) return;
            self.hideModal();

            var paths = self.selectedItems.map(function (i) { return i.path; });
            self.ajax({
                action_type: 'compress',
                paths: paths,
                destination: self.currentPath,
                archive_name: archiveName
            }, function (ok, data) {
                if (ok) {
                    self.toast('Archive created.', 'success');
                    self.refresh();
                } else {
                    self.toast(data.message || 'Compression failed.', 'error');
                }
            });
        });

        input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') document.getElementById('dfm-btn-do-compress').click();
        });

        this.els.modal.querySelector('.dfm-btn-cancel').addEventListener('click', function () { self.hideModal(); });
    };

    FileManager.prototype.showBatchRenameDialog = function () {
        if (this.selectedItems.length === 0) return;
        var self = this;

        var body = '<label>Find:</label>';
        body += '<input type="text" id="dfm-batch-find" placeholder="Text to find" style="margin-bottom:12px;">';
        body += '<label>Replace with:</label>';
        body += '<input type="text" id="dfm-batch-replace" placeholder="Replacement text (leave empty to remove)">';
        body += '<label style="display:flex;align-items:center;gap:8px;margin-top:12px;font-weight:normal;">';
        body += '<input type="checkbox" id="dfm-batch-regex"> Use regular expressions';
        body += '</label>';
        body += '<p style="margin-top:10px;font-size:12px;color:#787c82;">';
        body += 'Applies to ' + this.selectedItems.length + ' selected item(s).</p>';

        var footer = '<button class="dfm-btn-cancel">Cancel</button><button class="dfm-btn-primary" id="dfm-btn-do-batch-rename">Rename</button>';
        this.showModal('Batch Rename', body, footer);

        document.getElementById('dfm-btn-do-batch-rename').addEventListener('click', function () {
            var find      = document.getElementById('dfm-batch-find').value;
            var replace   = document.getElementById('dfm-batch-replace').value;
            var useRegex  = document.getElementById('dfm-batch-regex').checked;

            if (find === '') { self.toast('Please enter a search term.', 'error'); return; }
            self.hideModal();

            var paths = self.selectedItems.map(function (i) { return i.path; });
            self.ajax({
                action_type: 'batch_rename',
                paths: paths,
                find: find,
                replace: replace,
                use_regex: useRegex ? 'true' : 'false'
            }, function (ok, data) {
                self.toast(data.message || (ok ? 'Done.' : 'Failed.'), ok ? 'success' : 'error');
                self.selectedItems = [];
                self.refresh();
            });
        });

        this.els.modal.querySelector('.dfm-btn-cancel').addEventListener('click', function () { self.hideModal(); });
    };

    FileManager.prototype.showPropertiesDialog = function (item) {
        var self = this;

        // Load permissions first
        this.ajax({ action_type: 'get_permissions', path: item.path }, function (ok, data) {
            var perms = ok ? data.octal : '—';

            var body = '<table class="dfm-props-table">';
            body += '<tr><th>Name</th><td>' + esc(item.name) + '</td></tr>';
            body += '<tr><th>Path</th><td><code>' + esc(item.path) + '</code></td></tr>';
            body += '<tr><th>Type</th><td>' + (item.is_dir ? 'Folder' : esc(item.type || '—')) + '</td></tr>';
            if (!item.is_dir) {
                body += '<tr><th>Size</th><td>' + formatSize(item.size) + '</td></tr>';
            }
            body += '<tr><th>Modified</th><td>' + formatDate(item.modified) + '</td></tr>';
            body += '<tr><th>Permissions</th><td>';
            body += '<input type="text" id="dfm-props-perms" value="' + esc(perms) + '" maxlength="4" style="width:80px;font-family:monospace;">';
            body += ' <button id="dfm-btn-apply-perms" class="dfm-btn-small">Apply</button>';
            body += '</td></tr>';
            body += '</table>';

            var footer = '<button class="dfm-btn-cancel">Close</button>';
            self.showModal('Properties: ' + item.name, body, footer);

            document.getElementById('dfm-btn-apply-perms').addEventListener('click', function () {
                var mode = document.getElementById('dfm-props-perms').value.trim();
                self.ajax({ action_type: 'set_permissions', path: item.path, mode: mode }, function (ok2, d2) {
                    if (ok2) {
                        document.getElementById('dfm-props-perms').value = d2.octal;
                        self.toast('Permissions updated.', 'success');
                        self.refresh();
                    } else {
                        self.toast(d2.message || 'Failed to set permissions.', 'error');
                    }
                });
            });

            self.els.modal.querySelector('.dfm-btn-cancel').addEventListener('click', function () { self.hideModal(); });
        });
    };

    FileManager.prototype.showPreviewModal = function (data) {
        var self = this;
        var body = '';

        switch (data.preview_type) {
            case 'image':
                body += '<img class="dfm-preview-image" src="' + esc(data.url) + '" alt="' + esc(data.name) + '">';
                break;
            case 'text':
                body += '<pre class="dfm-preview-text">' + esc(data.content) + '</pre>';
                break;
            case 'video':
                body += '<video class="dfm-preview-video" controls><source src="' + esc(data.url) + '" type="' + esc(data.mime) + '">Your browser does not support video.</video>';
                break;
            case 'audio':
                body += '<audio class="dfm-preview-audio" controls><source src="' + esc(data.url) + '" type="' + esc(data.mime) + '">Your browser does not support audio.</audio>';
                break;
            default:
                body += '<p>Preview not available for this file type.</p>';
                if (data.url) {
                    body += '<p><a href="' + esc(data.url) + '" target="_blank">Download file</a></p>';
                }
        }

        body += '<div class="dfm-preview-info">';
        if (data.name) body += esc(data.name);
        if (data.size) body += ' &middot; ' + formatSize(data.size);
        if (data.mime) body += ' &middot; ' + esc(data.mime);
        body += '</div>';

        var footer = '<button class="dfm-btn-cancel">Close</button>';
        this.showModal('Preview: ' + (data.name || ''), body, footer);
        this.els.modal.querySelector('.dfm-btn-cancel').addEventListener('click', function () { self.hideModal(); });
    };

    /* ── Drag & Drop (external file upload) ─────────────────── */
    FileManager.prototype.bindDragDrop = function () {
        var self        = this;
        var main        = this.els.main;
        var overlay     = this.els.dropOverlay;
        var dragCounter = 0;

        function isExternalFileDrag(e) {
            return e.dataTransfer &&
                   e.dataTransfer.types &&
                   Array.prototype.indexOf.call(e.dataTransfer.types, 'Files') !== -1 &&
                   Array.prototype.indexOf.call(e.dataTransfer.types, 'application/dfm-items') === -1;
        }

        main.addEventListener('dragenter', function (e) {
            e.preventDefault();
            if (isExternalFileDrag(e)) {
                dragCounter++;
                overlay.classList.add('dfm-drag-active');
            }
        });

        main.addEventListener('dragleave', function (e) {
            e.preventDefault();
            if (dragCounter > 0) {
                dragCounter--;
                if (dragCounter <= 0) {
                    dragCounter = 0;
                    overlay.classList.remove('dfm-drag-active');
                }
            }
        });

        main.addEventListener('dragover', function (e) { e.preventDefault(); });

        main.addEventListener('drop', function (e) {
            e.preventDefault();
            dragCounter = 0;
            overlay.classList.remove('dfm-drag-active');

            if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0 && !self.dragging) {
                var droppedFiles = e.dataTransfer.files;
                var existingNames = self.items.map(function (i) { return i.name.toLowerCase(); });
                var conflicts = [];
                for (var i = 0; i < droppedFiles.length; i++) {
                    if (existingNames.indexOf(droppedFiles[i].name.toLowerCase()) !== -1) {
                        conflicts.push(droppedFiles[i].name);
                    }
                }
                if (conflicts.length > 0) {
                    self.showUploadConflictPrompt(droppedFiles, conflicts);
                } else {
                    self.uploadFiles(droppedFiles, false);
                }
            }
        });
    };

    /* ── Keyboard Shortcuts ──────────────────────────────────── */
    FileManager.prototype.bindKeyboard = function () {
        var self = this;

        document.addEventListener('keydown', function (e) {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            if (self.els.modal.classList.contains('dfm-visible')) return;

            switch (e.key) {
                case 'Delete':
                    if (self.selectedItems.length > 0) { e.preventDefault(); self.showDeleteConfirm(); }
                    break;
                case 'F2':
                    if (self.selectedItems.length === 1) { e.preventDefault(); self.showRenameDialog(); }
                    break;
                case 'Backspace':
                    if (e.altKey) { e.preventDefault(); self.goBack(); }
                    break;
                case 'c':
                    if ((e.ctrlKey || e.metaKey) && self.selectedItems.length > 0) {
                        e.preventDefault(); self.clipboardAction('copy');
                    }
                    break;
                case 'x':
                    if ((e.ctrlKey || e.metaKey) && self.selectedItems.length > 0) {
                        e.preventDefault(); self.clipboardAction('cut');
                    }
                    break;
                case 'v':
                    if ((e.ctrlKey || e.metaKey) && self.clipboard) {
                        e.preventDefault(); self.pasteItems();
                    }
                    break;
                case 'a':
                    if (e.ctrlKey || e.metaKey) {
                        e.preventDefault();
                        self.selectedItems = self.getFilteredAndSortedItems().slice();
                        self.renderFileList();
                        self.updateToolbarState();
                    }
                    break;
            }
        });
    };

    /* ── Toast ───────────────────────────────────────────────── */
    FileManager.prototype.toast = function (message, type) {
        type = type || 'info';
        var el = document.createElement('div');
        el.className  = 'dfm-toast dfm-toast-' + type;
        el.textContent = message;
        this.els.toastContainer.appendChild(el);

        setTimeout(function () {
            el.style.opacity    = '0';
            el.style.transition = 'opacity 0.3s';
            setTimeout(function () { el.remove(); }, 300);
        }, 3500);
    };

    /* ── Global Events ───────────────────────────────────────── */
    FileManager.prototype.bindEvents = function () {
        var self = this;

        document.addEventListener('click', function () { self.hideContextMenu(); });

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') {
                self.hideContextMenu();
                if (self.els.modal.classList.contains('dfm-visible')) {
                    self.hideModal();
                }
            }
        });

        this.bindDragDrop();
        this.bindKeyboard();
    };

    /* ── Init ────────────────────────────────────────────────── */
    document.addEventListener('DOMContentLoaded', function () {
        if (document.getElementById('dfm-app')) {
            new FileManager();
        }
    });
})();
