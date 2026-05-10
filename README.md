# File Manager

A full-featured file manager for `wp-content/uploads/` built as a WordPress plugin with a modern single-page application interface. Admin-only access.

**Version:** 1.2.2 | **Requires:** WordPress 5.0+, PHP 7.4+ | **License:** GPLv2

---

## Installation

1. Upload the `file-manager` folder to `/wp-content/plugins/`.
2. Activate the plugin through **WordPress Admin → Plugins**.
3. Navigate to **File Manager** in the admin sidebar.

---

## Features

### File Operations
| Feature | Description |
|---------|-------------|
| Browse | Grid or list view with sortable columns |
| Upload | File dialog or drag & drop (with conflict prompt) |
| Create | New file or new folder from toolbar or context menu |
| Rename | Inline rename or F2 shortcut |
| Delete | Single or multi-select delete |
| Copy / Move | Copy or cut files between directories |
| Duplicate | Creates a `-copy` variant in the same directory |
| Compress | Compress selected items to a ZIP archive (requires PHP ZipArchive) |
| Extract | Extract ZIP archives to a subfolder |
| Bulk Download | Download multiple files or entire folders as a ZIP |
| Batch Rename | Find & replace across filenames (plain text or regex) |
| Properties | View file metadata and edit permissions (chmod) |
| Copy URL / Path | Copy file URL or path to clipboard from context menu |

### Navigation
| Feature | Description |
|---------|-------------|
| Folder Tree | Collapsible sidebar tree with lazy-loaded subfolders |
| Breadcrumb | Click-to-navigate breadcrumb bar |
| Back / Forward | Browser-style navigation history buttons |
| Bookmarks | Sidebar bookmarks panel (stored in localStorage) |
| Live Search | Filter files in the current folder as you type |

### Selection & Shortcuts
| Feature | Description |
|---------|-------------|
| Multi-select | Ctrl+click and Shift+click |
| Keyboard shortcuts | `Delete`, `F2`, `Ctrl+C`, `Ctrl+X`, `Ctrl+V`, `Ctrl+A` |
| Right-click menu | Context menu for all common actions |

### Preview
- Images, text files, audio, and video previewed inline.

---

## Security

| Protection | Detail |
|-----------|--------|
| Admin-only access | Requires `manage_options` capability |
| Path traversal protection | All paths validated with `realpath()` |
| Nonce verification | Every AJAX request verified with a WordPress nonce |
| Filename sanitization | Filenames sanitized before all operations |
| Blocked extensions | PHP, PHTML, EXE, BAT, CMD, and other executable types blocked |
| Upload size limit | Respects WordPress `wp_max_upload_size()` |

---

## FAQ

**Who can access the file manager?**
Only administrators with the `manage_options` capability.

**What directory does it manage?**
`wp-content/uploads/` only — it cannot access files outside this directory.

**What file types are blocked from upload?**
PHP, PHTML, EXE, BAT, CMD, and other potentially dangerous executable types.

---

## Files

```
file-manager/
├── file-manager.php                    # Plugin entry point
├── includes/
│   ├── class-dfm-file-operations.php  # Server-side file operations
│   ├── class-dfm-ajax-handler.php     # AJAX request handler
│   └── class-dfm-updater.php          # Auto-updater
├── assets/
│   ├── css/                           # Admin styles
│   └── js/                            # SPA frontend
└── README.md                          # This file
```

---

## Changelog

### 1.2.2
- Fixed: Upload dialog detects filename conflicts and shows a Replace / Keep Both prompt when "Replace existing files" is unchecked.
- Fixed: Drag & drop uploads now show the same conflict prompt instead of silently auto-renaming.
- Improved: Conflict prompt logic unified into a single shared method for both upload paths.

### 1.2.1
- Fixed: Overwrite prompt dismissed via Escape, × button, or backdrop now correctly invokes the callback on any dismiss path.
- Fixed: Folder tree lazy-loads subfolders beyond the initial two levels on demand.
- Fixed: File reference captured before modal close to prevent FileList loss in some browsers.
- Improved: Tree event listeners use delegation so dynamically loaded nodes respond without rebinding.

### 1.2.0
- Added: Create new empty file from toolbar and context menu.
- Added: Duplicate file or folder.
- Added: Compress selected items to ZIP archive.
- Added: Extract ZIP archives to a subfolder.
- Added: Bulk download multiple files or folders as ZIP.
- Added: Overwrite/replace prompt for conflicting copy or move operations.
- Added: Replace existing files checkbox in the upload dialog.
- Added: Batch rename with find & replace (plain text or regex).
- Added: Properties dialog with file metadata and editable permissions (chmod).
- Added: Copy file URL and path to clipboard from context menu.
- Added: Bookmarks panel in the sidebar (localStorage).
- Added: Back and Forward navigation history buttons.
- Added: Sortable columns in list view.
- Added: Live search/filter input for the current folder.
- Added: Permissions column in list view.
- Improved: Delete context menu item styled in red for clarity.

### 1.0.1
- Added: Internal drag and drop to move files and folders.

### 1.0.0
- Initial release.
