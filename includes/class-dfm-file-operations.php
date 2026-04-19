<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class DFM_File_Operations {

    private $base_path;

    private $blocked_extensions = array(
        'php', 'phtml', 'php3', 'php4', 'php5', 'php7', 'phps', 'pht', 'phar',
        'exe', 'bat', 'cmd', 'com', 'scr', 'msi', 'dll', 'vbs', 'vbe',
        'js', 'jse', 'wsf', 'wsh', 'ps1', 'ps2', 'psc1', 'psc2',
        'cgi', 'pl', 'sh', 'bash', 'csh',
        'htaccess', 'htpasswd',
    );

    public function __construct() {
        $this->base_path = wp_normalize_path( untrailingslashit( ABSPATH ) );
    }

    /**
     * Validate and resolve a path, ensuring it is within the uploads directory.
     */
    public function validate_path( $relative_path ) {
        $relative_path = wp_normalize_path( $relative_path );
        $relative_path = ltrim( $relative_path, '/' );

        if ( '' === $relative_path || '.' === $relative_path ) {
            return $this->base_path;
        }

        if ( preg_match( '/\.\./', $relative_path ) ) {
            return new WP_Error( 'invalid_path', 'Invalid path: directory traversal not allowed.' );
        }

        $full_path = $this->base_path . '/' . $relative_path;

        if ( file_exists( $full_path ) ) {
            $real = wp_normalize_path( realpath( $full_path ) );
            if ( 0 !== strpos( $real, $this->base_path ) ) {
                return new WP_Error( 'invalid_path', 'Path is outside the allowed directory.' );
            }
            return $real;
        }

        $parent = dirname( $full_path );
        if ( ! file_exists( $parent ) ) {
            return new WP_Error( 'invalid_path', 'Parent directory does not exist.' );
        }
        $real_parent = wp_normalize_path( realpath( $parent ) );
        if ( 0 !== strpos( $real_parent, $this->base_path ) ) {
            return new WP_Error( 'invalid_path', 'Path is outside the allowed directory.' );
        }

        return $real_parent . '/' . basename( $full_path );
    }

    /**
     * Get the relative path from the base directory.
     */
    public function get_relative_path( $absolute_path ) {
        $absolute_path = wp_normalize_path( $absolute_path );
        if ( $absolute_path === $this->base_path ) {
            return '';
        }
        return ltrim( str_replace( $this->base_path, '', $absolute_path ), '/' );
    }

    /**
     * Check if a filename has a blocked extension.
     */
    public function is_blocked_extension( $filename ) {
        $ext = strtolower( pathinfo( $filename, PATHINFO_EXTENSION ) );
        return in_array( $ext, $this->blocked_extensions, true );
    }

    /**
     * List the contents of a directory.
     */
    public function list_directory( $relative_path ) {
        $dir_path = $this->validate_path( $relative_path );
        if ( is_wp_error( $dir_path ) ) {
            return $dir_path;
        }

        if ( ! is_dir( $dir_path ) ) {
            return new WP_Error( 'not_directory', 'The specified path is not a directory.' );
        }

        $items  = array();
        $handle = opendir( $dir_path );
        if ( false === $handle ) {
            return new WP_Error( 'read_error', 'Cannot read directory.' );
        }

        while ( false !== ( $entry = readdir( $handle ) ) ) {
            if ( '.' === $entry || '..' === $entry ) {
                continue;
            }

            $full   = $dir_path . '/' . $entry;
            $is_dir = is_dir( $full );

            $item = array(
                'name'     => $entry,
                'path'     => $this->get_relative_path( $full ),
                'is_dir'   => $is_dir,
                'size'     => $is_dir ? 0 : filesize( $full ),
                'modified' => filemtime( $full ),
                'type'     => $is_dir ? 'folder' : strtolower( pathinfo( $entry, PATHINFO_EXTENSION ) ),
                'perms'    => substr( sprintf( '%o', fileperms( $full ) ), -4 ),
            );

            if ( ! $is_dir ) {
                $item['mime'] = wp_check_filetype( $entry )['type'];
            }

            $items[] = $item;
        }
        closedir( $handle );

        usort( $items, function( $a, $b ) {
            if ( $a['is_dir'] !== $b['is_dir'] ) {
                return $a['is_dir'] ? -1 : 1;
            }
            return strcasecmp( $a['name'], $b['name'] );
        } );

        return $items;
    }

    /**
     * Create a new folder.
     */
    public function create_folder( $relative_path, $name ) {
        $name = sanitize_file_name( $name );
        if ( empty( $name ) ) {
            return new WP_Error( 'invalid_name', 'Invalid folder name.' );
        }

        $parent = $this->validate_path( $relative_path );
        if ( is_wp_error( $parent ) ) {
            return $parent;
        }

        $new_path = $parent . '/' . $name;
        if ( file_exists( $new_path ) ) {
            return new WP_Error( 'exists', 'A file or folder with that name already exists.' );
        }

        if ( ! wp_mkdir_p( $new_path ) ) {
            return new WP_Error( 'create_error', 'Failed to create folder.' );
        }

        return array( 'path' => $this->get_relative_path( $new_path ) );
    }

    /**
     * Create a new empty file.
     */
    public function create_file( $relative_path, $name ) {
        $name = sanitize_file_name( $name );
        if ( empty( $name ) ) {
            return new WP_Error( 'invalid_name', 'Invalid file name.' );
        }

        if ( $this->is_blocked_extension( $name ) ) {
            return new WP_Error( 'blocked_extension', 'That file extension is not allowed.' );
        }

        $parent = $this->validate_path( $relative_path );
        if ( is_wp_error( $parent ) ) {
            return $parent;
        }

        $new_path = $parent . '/' . $name;
        if ( file_exists( $new_path ) ) {
            return new WP_Error( 'exists', 'A file with that name already exists.' );
        }

        if ( false === file_put_contents( $new_path, '' ) ) {
            return new WP_Error( 'create_error', 'Failed to create file.' );
        }

        chmod( $new_path, 0644 );
        return array( 'path' => $this->get_relative_path( $new_path ) );
    }

    /**
     * Handle file uploads.
     *
     * @param string $relative_path  Destination directory.
     * @param array  $files          $_FILES array.
     * @param bool   $overwrite      Replace existing files when true.
     */
    public function upload_files( $relative_path, $files, $overwrite = false ) {
        $dir_path = $this->validate_path( $relative_path );
        if ( is_wp_error( $dir_path ) ) {
            return $dir_path;
        }

        if ( ! is_dir( $dir_path ) ) {
            return new WP_Error( 'not_directory', 'Upload destination is not a directory.' );
        }

        $uploaded = array();
        $errors   = array();
        $max_size = wp_max_upload_size();

        $file_list = array();
        if ( isset( $files['name'] ) && is_array( $files['name'] ) ) {
            $count = count( $files['name'] );
            for ( $i = 0; $i < $count; $i++ ) {
                $file_list[] = array(
                    'name'     => $files['name'][ $i ],
                    'tmp_name' => $files['tmp_name'][ $i ],
                    'size'     => $files['size'][ $i ],
                    'error'    => $files['error'][ $i ],
                );
            }
        } else {
            $file_list[] = $files;
        }

        foreach ( $file_list as $file ) {
            $name = sanitize_file_name( $file['name'] );

            if ( UPLOAD_ERR_OK !== $file['error'] ) {
                $errors[] = sprintf( '%s: upload error (%d).', $name, $file['error'] );
                continue;
            }

            if ( $file['size'] > $max_size ) {
                $errors[] = sprintf( '%s: exceeds maximum upload size.', $name );
                continue;
            }

            if ( $this->is_blocked_extension( $name ) ) {
                $errors[] = sprintf( '%s: file type is not allowed.', $name );
                continue;
            }

            $dest = $dir_path . '/' . $name;

            if ( file_exists( $dest ) ) {
                if ( $overwrite ) {
                    if ( ! unlink( $dest ) ) {
                        $errors[] = sprintf( '%s: could not overwrite existing file.', $name );
                        continue;
                    }
                } else {
                    // Auto-rename.
                    $base = pathinfo( $name, PATHINFO_FILENAME );
                    $ext  = pathinfo( $name, PATHINFO_EXTENSION );
                    $n    = 1;
                    while ( file_exists( $dest ) ) {
                        $new_name = $base . '-' . $n . ( $ext ? '.' . $ext : '' );
                        $dest     = $dir_path . '/' . $new_name;
                        $n++;
                    }
                    $name = basename( $dest );
                }
            }

            if ( ! move_uploaded_file( $file['tmp_name'], $dest ) ) {
                $errors[] = sprintf( '%s: failed to move uploaded file.', $name );
                continue;
            }

            chmod( $dest, 0644 );
            $uploaded[] = $name;
        }

        return array(
            'uploaded' => $uploaded,
            'errors'   => $errors,
        );
    }

    /**
     * Delete a file or folder.
     */
    public function delete( $relative_path ) {
        $target = $this->validate_path( $relative_path );
        if ( is_wp_error( $target ) ) {
            return $target;
        }

        if ( $target === $this->base_path ) {
            return new WP_Error( 'forbidden', 'Cannot delete the root directory.' );
        }

        if ( is_dir( $target ) ) {
            $result = $this->delete_directory_recursive( $target );
            if ( ! $result ) {
                return new WP_Error( 'delete_error', 'Failed to delete folder.' );
            }
        } else {
            if ( ! unlink( $target ) ) {
                return new WP_Error( 'delete_error', 'Failed to delete file.' );
            }
        }

        return true;
    }

    /**
     * Recursively delete a directory.
     */
    private function delete_directory_recursive( $dir ) {
        $items = new DirectoryIterator( $dir );
        foreach ( $items as $item ) {
            if ( $item->isDot() ) {
                continue;
            }
            if ( $item->isDir() ) {
                $this->delete_directory_recursive( $item->getPathname() );
            } else {
                unlink( $item->getPathname() );
            }
        }
        return rmdir( $dir );
    }

    /**
     * Rename a file or folder.
     */
    public function rename( $relative_path, $new_name ) {
        $old_path = $this->validate_path( $relative_path );
        if ( is_wp_error( $old_path ) ) {
            return $old_path;
        }

        if ( $old_path === $this->base_path ) {
            return new WP_Error( 'forbidden', 'Cannot rename the root directory.' );
        }

        $new_name = sanitize_file_name( $new_name );
        if ( empty( $new_name ) ) {
            return new WP_Error( 'invalid_name', 'Invalid name.' );
        }

        if ( ! is_dir( $old_path ) && $this->is_blocked_extension( $new_name ) ) {
            return new WP_Error( 'blocked_extension', 'That file extension is not allowed.' );
        }

        $new_path = dirname( $old_path ) . '/' . $new_name;
        if ( file_exists( $new_path ) ) {
            return new WP_Error( 'exists', 'A file or folder with that name already exists.' );
        }

        if ( ! rename( $old_path, $new_path ) ) {
            return new WP_Error( 'rename_error', 'Failed to rename.' );
        }

        return array( 'path' => $this->get_relative_path( $new_path ) );
    }

    /**
     * Duplicate a file or folder in the same directory.
     */
    public function duplicate( $relative_path ) {
        $source = $this->validate_path( $relative_path );
        if ( is_wp_error( $source ) ) {
            return $source;
        }

        if ( $source === $this->base_path ) {
            return new WP_Error( 'forbidden', 'Cannot duplicate the root directory.' );
        }

        $parent   = dirname( $source );
        $basename = basename( $source );
        $ext      = pathinfo( $basename, PATHINFO_EXTENSION );
        $base     = $ext ? substr( $basename, 0, -( strlen( $ext ) + 1 ) ) : $basename;

        $n    = 1;
        $dest = $parent . '/' . $base . '-copy' . ( $ext ? '.' . $ext : '' );
        while ( file_exists( $dest ) ) {
            $n++;
            $dest = $parent . '/' . $base . '-copy' . $n . ( $ext ? '.' . $ext : '' );
        }

        if ( is_dir( $source ) ) {
            if ( ! $this->copy_directory_recursive( $source, $dest ) ) {
                return new WP_Error( 'copy_error', 'Failed to duplicate folder.' );
            }
        } else {
            if ( ! copy( $source, $dest ) ) {
                return new WP_Error( 'copy_error', 'Failed to duplicate file.' );
            }
        }

        return array( 'path' => $this->get_relative_path( $dest ) );
    }

    /**
     * Copy a file or folder to a destination directory.
     *
     * @param bool $overwrite Replace existing item when true.
     */
    public function copy( $source_relative, $dest_relative, $overwrite = false ) {
        $source = $this->validate_path( $source_relative );
        if ( is_wp_error( $source ) ) {
            return $source;
        }

        $dest_dir = $this->validate_path( $dest_relative );
        if ( is_wp_error( $dest_dir ) ) {
            return $dest_dir;
        }

        if ( ! is_dir( $dest_dir ) ) {
            return new WP_Error( 'not_directory', 'Destination is not a directory.' );
        }

        $dest = $dest_dir . '/' . basename( $source );

        if ( file_exists( $dest ) ) {
            if ( ! $overwrite ) {
                return new WP_Error( 'exists', 'An item with that name already exists in the destination.' );
            }
            // Remove existing destination so we can overwrite.
            if ( is_dir( $dest ) ) {
                $this->delete_directory_recursive( $dest );
            } else {
                unlink( $dest );
            }
        }

        if ( is_dir( $source ) ) {
            $result = $this->copy_directory_recursive( $source, $dest );
            if ( ! $result ) {
                return new WP_Error( 'copy_error', 'Failed to copy folder.' );
            }
        } else {
            if ( ! copy( $source, $dest ) ) {
                return new WP_Error( 'copy_error', 'Failed to copy file.' );
            }
        }

        return array( 'path' => $this->get_relative_path( $dest ) );
    }

    /**
     * Recursively copy a directory.
     */
    private function copy_directory_recursive( $source, $dest ) {
        if ( ! wp_mkdir_p( $dest ) ) {
            return false;
        }

        $items = new DirectoryIterator( $source );
        foreach ( $items as $item ) {
            if ( $item->isDot() ) {
                continue;
            }
            $src_path  = $item->getPathname();
            $dest_path = $dest . '/' . $item->getFilename();

            if ( $item->isDir() ) {
                if ( ! $this->copy_directory_recursive( $src_path, $dest_path ) ) {
                    return false;
                }
            } else {
                if ( ! copy( $src_path, $dest_path ) ) {
                    return false;
                }
            }
        }
        return true;
    }

    /**
     * Move a file or folder to a destination directory.
     *
     * @param bool $overwrite Replace existing item when true.
     */
    public function move( $source_relative, $dest_relative, $overwrite = false ) {
        $source = $this->validate_path( $source_relative );
        if ( is_wp_error( $source ) ) {
            return $source;
        }

        if ( $source === $this->base_path ) {
            return new WP_Error( 'forbidden', 'Cannot move the root directory.' );
        }

        $dest_dir = $this->validate_path( $dest_relative );
        if ( is_wp_error( $dest_dir ) ) {
            return $dest_dir;
        }

        if ( ! is_dir( $dest_dir ) ) {
            return new WP_Error( 'not_directory', 'Destination is not a directory.' );
        }

        $norm_source   = wp_normalize_path( $source );
        $norm_dest_dir = wp_normalize_path( $dest_dir );
        if ( 0 === strpos( $norm_dest_dir, $norm_source . '/' ) || $norm_dest_dir === $norm_source ) {
            return new WP_Error( 'invalid_move', 'Cannot move a folder into itself.' );
        }

        $dest = $dest_dir . '/' . basename( $source );

        if ( file_exists( $dest ) ) {
            if ( ! $overwrite ) {
                return new WP_Error( 'exists', 'An item with that name already exists in the destination.' );
            }
            if ( is_dir( $dest ) ) {
                $this->delete_directory_recursive( $dest );
            } else {
                unlink( $dest );
            }
        }

        if ( ! rename( $source, $dest ) ) {
            return new WP_Error( 'move_error', 'Failed to move.' );
        }

        return array( 'path' => $this->get_relative_path( $dest ) );
    }

    /**
     * Compress items into a ZIP archive.
     */
    public function compress_items( $items_relative, $dest_relative, $archive_name ) {
        if ( ! class_exists( 'ZipArchive' ) ) {
            return new WP_Error( 'no_zip', 'ZipArchive PHP extension is not available on this server.' );
        }

        $archive_name = sanitize_file_name( $archive_name );
        if ( empty( $archive_name ) ) {
            $archive_name = 'archive';
        }
        if ( 'zip' !== strtolower( pathinfo( $archive_name, PATHINFO_EXTENSION ) ) ) {
            $archive_name .= '.zip';
        }

        $dest_dir = $this->validate_path( $dest_relative );
        if ( is_wp_error( $dest_dir ) ) {
            return $dest_dir;
        }

        $archive_path = $dest_dir . '/' . $archive_name;
        if ( file_exists( $archive_path ) ) {
            return new WP_Error( 'exists', 'An archive with that name already exists in the destination.' );
        }

        $zip = new ZipArchive();
        if ( true !== $zip->open( $archive_path, ZipArchive::CREATE ) ) {
            return new WP_Error( 'compress_error', 'Failed to create archive.' );
        }

        foreach ( $items_relative as $item_relative ) {
            $item_path = $this->validate_path( wp_normalize_path( $item_relative ) );
            if ( is_wp_error( $item_path ) ) {
                continue;
            }
            if ( is_dir( $item_path ) ) {
                $this->zip_add_directory( $zip, $item_path, basename( $item_path ) );
            } else {
                $zip->addFile( $item_path, basename( $item_path ) );
            }
        }

        $zip->close();
        return array( 'path' => $this->get_relative_path( $archive_path ) );
    }

    /**
     * Recursively add a directory into a ZipArchive.
     */
    private function zip_add_directory( $zip, $dir, $base ) {
        $zip->addEmptyDir( $base );
        $items = new DirectoryIterator( $dir );
        foreach ( $items as $item ) {
            if ( $item->isDot() ) {
                continue;
            }
            if ( $item->isDir() ) {
                $this->zip_add_directory( $zip, $item->getPathname(), $base . '/' . $item->getFilename() );
            } else {
                $zip->addFile( $item->getPathname(), $base . '/' . $item->getFilename() );
            }
        }
    }

    /**
     * Extract a ZIP archive to a destination directory.
     */
    public function extract_archive( $relative_path, $dest_relative ) {
        if ( ! class_exists( 'ZipArchive' ) ) {
            return new WP_Error( 'no_zip', 'ZipArchive PHP extension is not available on this server.' );
        }

        $archive_path = $this->validate_path( $relative_path );
        if ( is_wp_error( $archive_path ) ) {
            return $archive_path;
        }

        $dest_dir = $this->validate_path( $dest_relative );
        if ( is_wp_error( $dest_dir ) ) {
            return $dest_dir;
        }

        $zip = new ZipArchive();
        if ( true !== $zip->open( $archive_path ) ) {
            return new WP_Error( 'extract_error', 'Failed to open archive.' );
        }

        // Validate paths inside the archive before extracting.
        for ( $i = 0; $i < $zip->numFiles; $i++ ) {
            $entry_name = $zip->getNameIndex( $i );
            if ( false !== strpos( $entry_name, '..' ) ) {
                $zip->close();
                return new WP_Error( 'invalid_archive', 'Archive contains unsafe paths and cannot be extracted.' );
            }
        }

        $folder_name  = sanitize_file_name( pathinfo( basename( $archive_path ), PATHINFO_FILENAME ) );
        $extract_to   = $dest_dir . '/' . $folder_name;
        $n            = 1;
        $base_extract = $extract_to;
        while ( file_exists( $extract_to ) ) {
            $extract_to = $base_extract . '-' . $n++;
        }

        wp_mkdir_p( $extract_to );
        $zip->extractTo( $extract_to );
        $zip->close();

        return array( 'path' => $this->get_relative_path( $extract_to ) );
    }

    /**
     * Create a temporary ZIP for bulk download.
     * Returns the temp file path on success or WP_Error.
     */
    public function create_download_zip( $items_relative ) {
        if ( ! class_exists( 'ZipArchive' ) ) {
            return new WP_Error( 'no_zip', 'ZipArchive PHP extension is not available on this server.' );
        }

        $tmp_path = tempnam( sys_get_temp_dir(), 'dfm_' );
        // tempnam creates a file; ZipArchive::CREATE + overwrite needs it gone first.
        @unlink( $tmp_path );
        $tmp_path .= '.zip';

        $zip = new ZipArchive();
        if ( true !== $zip->open( $tmp_path, ZipArchive::CREATE ) ) {
            return new WP_Error( 'zip_error', 'Failed to create download archive.' );
        }

        foreach ( $items_relative as $item_relative ) {
            $item_path = $this->validate_path( wp_normalize_path( $item_relative ) );
            if ( is_wp_error( $item_path ) ) {
                continue;
            }
            if ( is_dir( $item_path ) ) {
                $this->zip_add_directory( $zip, $item_path, basename( $item_path ) );
            } else {
                $zip->addFile( $item_path, basename( $item_path ) );
            }
        }

        $zip->close();
        return $tmp_path;
    }

    /**
     * Get filesystem permissions for a path.
     */
    public function get_permissions( $relative_path ) {
        $path = $this->validate_path( $relative_path );
        if ( is_wp_error( $path ) ) {
            return $path;
        }

        $raw   = fileperms( $path );
        $octal = substr( sprintf( '%o', $raw ), -4 );

        return array(
            'octal'  => $octal,
            'is_dir' => is_dir( $path ),
        );
    }

    /**
     * Set filesystem permissions for a path.
     */
    public function set_permissions( $relative_path, $mode ) {
        $path = $this->validate_path( $relative_path );
        if ( is_wp_error( $path ) ) {
            return $path;
        }

        if ( $path === $this->base_path ) {
            return new WP_Error( 'forbidden', 'Cannot change permissions of the root directory.' );
        }

        // Only accept 3- or 4-digit octal strings like 644 or 0644.
        if ( ! preg_match( '/^0?[0-7]{3}$/', $mode ) ) {
            return new WP_Error( 'invalid_mode', 'Invalid permission mode. Use octal notation, e.g. 644.' );
        }

        $mode_int = octdec( ltrim( $mode, '0' ) ?: '0' );

        if ( ! chmod( $path, $mode_int ) ) {
            return new WP_Error( 'chmod_error', 'Failed to change permissions.' );
        }

        return array( 'octal' => substr( sprintf( '%o', fileperms( $path ) ), -4 ) );
    }

    /**
     * Batch-rename items by find-and-replace in their filenames.
     */
    public function batch_rename( $items_relative, $find, $replace, $use_regex = false ) {
        $results = array( 'renamed' => array(), 'errors' => array() );

        foreach ( $items_relative as $item_relative ) {
            $old_path = $this->validate_path( wp_normalize_path( $item_relative ) );
            if ( is_wp_error( $old_path ) ) {
                $results['errors'][] = basename( $item_relative ) . ': ' . $old_path->get_error_message();
                continue;
            }

            $old_name = basename( $old_path );

            if ( $use_regex ) {
                // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
                $new_name = @preg_replace( $find, $replace, $old_name );
                if ( null === $new_name ) {
                    $results['errors'][] = $old_name . ': Invalid regex pattern.';
                    continue;
                }
            } else {
                $new_name = str_replace( $find, $replace, $old_name );
            }

            $new_name = sanitize_file_name( $new_name );

            if ( empty( $new_name ) || $new_name === $old_name ) {
                continue;
            }

            if ( ! is_dir( $old_path ) && $this->is_blocked_extension( $new_name ) ) {
                $results['errors'][] = $old_name . ': Blocked file extension.';
                continue;
            }

            $new_path = dirname( $old_path ) . '/' . $new_name;
            if ( file_exists( $new_path ) ) {
                $results['errors'][] = $old_name . ': A file with the target name already exists.';
                continue;
            }

            if ( rename( $old_path, $new_path ) ) {
                $results['renamed'][] = array(
                    'old'  => $old_name,
                    'new'  => $new_name,
                    'path' => $this->get_relative_path( $new_path ),
                );
            } else {
                $results['errors'][] = $old_name . ': Rename failed.';
            }
        }

        return $results;
    }

    /**
     * Get file content for preview (text files only, limited size).
     */
    public function get_file_content( $relative_path ) {
        $file_path = $this->validate_path( $relative_path );
        if ( is_wp_error( $file_path ) ) {
            return $file_path;
        }

        if ( is_dir( $file_path ) ) {
            return new WP_Error( 'is_directory', 'Cannot preview a directory.' );
        }

        $max_preview_size = 512 * 1024;
        $size             = filesize( $file_path );

        if ( $size > $max_preview_size ) {
            return new WP_Error( 'too_large', 'File is too large to preview.' );
        }

        $content = file_get_contents( $file_path );
        if ( false === $content ) {
            return new WP_Error( 'read_error', 'Cannot read file.' );
        }

        $filetype = wp_check_filetype( basename( $file_path ) );

        return array(
            'content' => $content,
            'mime'    => $filetype['type'],
            'size'    => $size,
            'name'    => basename( $file_path ),
        );
    }

    /**
     * Save content to a file.
     */
    public function save_file_content( $relative_path, $content ) {
        $file_path = $this->validate_path( $relative_path );
        if ( is_wp_error( $file_path ) ) {
            return $file_path;
        }

        if ( is_dir( $file_path ) ) {
            return new WP_Error( 'is_directory', 'Cannot write to a directory.' );
        }

        if ( ! file_exists( $file_path ) ) {
            return new WP_Error( 'not_found', 'File does not exist.' );
        }

        $result = file_put_contents( $file_path, $content );
        if ( false === $result ) {
            return new WP_Error( 'write_error', 'Failed to save file.' );
        }

        return array(
            'name' => basename( $file_path ),
            'size' => $result,
        );
    }

    /**
     * Get the URL for a file.
     */
    public function get_file_url( $relative_path ) {
        $file_path = $this->validate_path( $relative_path );
        if ( is_wp_error( $file_path ) ) {
            return $file_path;
        }

        if ( is_dir( $file_path ) ) {
            return new WP_Error( 'is_directory', 'Cannot download a directory.' );
        }

        $relative = $this->get_relative_path( $file_path );

        return array(
            'url'  => site_url( '/' . $relative ),
            'name' => basename( $file_path ),
            'path' => $file_path,
        );
    }

    /**
     * Get the folder tree structure for the sidebar.
     */
    public function get_folder_tree( $relative_path = '', $depth = 3 ) {
        $dir_path = $this->validate_path( $relative_path );
        if ( is_wp_error( $dir_path ) ) {
            return $dir_path;
        }

        return $this->build_tree( $dir_path, $depth, 0 );
    }

    private function build_tree( $dir, $max_depth, $current_depth ) {
        $tree = array();

        if ( $current_depth >= $max_depth ) {
            $has_children = false;
            $h            = opendir( $dir );
            if ( $h ) {
                while ( false !== ( $e = readdir( $h ) ) ) {
                    if ( '.' !== $e && '..' !== $e && is_dir( $dir . '/' . $e ) ) {
                        $has_children = true;
                        break;
                    }
                }
                closedir( $h );
            }
            return $has_children ? 'has_children' : array();
        }

        $handle = opendir( $dir );
        if ( false === $handle ) {
            return $tree;
        }

        $folders = array();
        while ( false !== ( $entry = readdir( $handle ) ) ) {
            if ( '.' === $entry || '..' === $entry ) {
                continue;
            }
            $full = $dir . '/' . $entry;
            if ( is_dir( $full ) ) {
                $folders[] = $entry;
            }
        }
        closedir( $handle );
        sort( $folders, SORT_STRING | SORT_FLAG_CASE );

        foreach ( $folders as $folder ) {
            $full     = $dir . '/' . $folder;
            $children = $this->build_tree( $full, $max_depth, $current_depth + 1 );

            $tree[] = array(
                'name'         => $folder,
                'path'         => $this->get_relative_path( $full ),
                'children'     => is_array( $children ) ? $children : array(),
                'has_children' => ( 'has_children' === $children || ( is_array( $children ) && ! empty( $children ) ) ),
            );
        }

        return $tree;
    }
}
