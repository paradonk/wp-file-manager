=== File Manager ===
Contributors: Paradorn Katananon
Tags: file manager, uploads, media, files, folders
Requires at least: 5.0
Tested up to: 6.9.4
Requires PHP: 7.4
Stable tag: 1.2.2
License: GPL-2.0-or-later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

A full-featured file manager for wp-content/uploads/ with a modern single-page application interface. Admin-only access.

== Description ==

File Manager provides a modern, intuitive file management interface directly within the WordPress admin panel. It allows administrators to browse, upload, download, rename, delete, copy, move, and preview files within the `wp-content/uploads/` directory.

**Features:**

* Browse files and folders with grid or list view
* Upload files via dialog or drag & drop
* Create, rename, and delete files and folders
* Copy and move files between directories
* Preview images, text files, audio, and video inline
* Collapsible folder tree sidebar for navigation
* Right-click context menu for quick actions
* Keyboard shortcuts (Delete, F2, Ctrl+C/X/V/A)
* Breadcrumb navigation
* Multi-select with Ctrl+click and Shift+click
* Toast notifications for operation feedback
* Responsive design for smaller screens

**Security:**

* Admin-only access (requires `manage_options` capability)
* Path traversal protection via `realpath()` validation
* WordPress nonce verification on all requests
* Filename sanitization
* Blocked dangerous file extensions (PHP, EXE, etc.)
* Respects WordPress upload size limits

== Installation ==

1. Upload the `file-manager` folder to `/wp-content/plugins/`
2. Activate the plugin through the 'Plugins' menu in WordPress
3. Navigate to Tools > File Manager

== Frequently Asked Questions ==

= Who can access the file manager? =

Only administrators with the `manage_options` capability can access the file manager.

= What directory does it manage? =

The plugin manages files within `wp-content/uploads/` only. It cannot access files outside this directory.

= What file types are blocked? =

PHP, PHTML, EXE, BAT, CMD, and other potentially dangerous executable file types are blocked from upload.

== Changelog ==

= 1.2.2 =
* Fixed: Upload dialog now detects filename conflicts and shows a Replace / Keep Both prompt when the "Replace existing files" checkbox is not checked.
* Fixed: Drag & drop uploads that conflict with existing files now show a Replace / Keep Both prompt instead of silently auto-renaming.
* Improved: Conflict prompt logic unified into a single shared method used by both dialog upload and drag & drop.

= 1.2.1 =
* Fixed: Overwrite/replace prompt dismissed via Escape, × button, or backdrop click no longer leaves the file list unrefreshed — callback is now correctly invoked on any dismiss path.
* Fixed: Folder tree now lazy-loads subfolders beyond the initial two levels; clicking an arrow on a deep folder fetches and inserts its children on demand.
* Fixed: File reference captured before modal close in the upload dialog to prevent potential FileList loss in some browsers.
* Improved: Tree event listeners use delegation so dynamically loaded tree nodes respond to clicks and drag-and-drop without rebinding.

= 1.2.0 =
* Added: Create new empty file from toolbar and context menu.
* Added: Duplicate file or folder (creates a -copy variant in the same directory).
* Added: Compress selected items to ZIP archive (requires PHP ZipArchive extension).
* Added: Extract ZIP archives to a subfolder alongside the archive.
* Added: Bulk download — download multiple files or entire folders as a ZIP.
* Added: Overwrite/replace prompt when a copy or move operation conflicts with an existing item.
* Added: Replace existing files checkbox in the upload dialog.
* Added: Batch rename with find & replace (plain text or regular expression).
* Added: Properties dialog showing file metadata and editable permissions (chmod).
* Added: Copy file URL and path to clipboard from context menu.
* Added: Bookmarks panel in the sidebar (stored in browser localStorage).
* Added: Back and Forward navigation history buttons.
* Added: Sortable columns in list view.
* Added: Live search/filter input to filter files in the current folder.
* Added: Permissions column in list view.
* Improved: Delete context menu item styled in red for clarity.

= 1.0.1 =
* Added internal drag and drop to move files and folders.

= 1.0.0 =
* Initial release.
