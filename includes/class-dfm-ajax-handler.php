<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class DFM_Ajax_Handler {

    private $file_ops;

    public function __construct() {
        $this->file_ops = new DFM_File_Operations();
        add_action( 'wp_ajax_dfm_action', array( $this, 'handle_request' ) );
    }

    public function handle_request() {
        if ( ! check_ajax_referer( 'dfm_nonce', 'nonce', false ) ) {
            wp_send_json_error( array( 'message' => 'Security check failed.' ), 403 );
        }

        if ( ! current_user_can( 'manage_options' ) ) {
            wp_send_json_error( array( 'message' => 'Unauthorized.' ), 403 );
        }

        $action_type = isset( $_REQUEST['action_type'] ) ? sanitize_text_field( $_REQUEST['action_type'] ) : '';

        switch ( $action_type ) {
            case 'list':
                $this->handle_list();
                break;
            case 'tree':
                $this->handle_tree();
                break;
            case 'create_folder':
                $this->handle_create_folder();
                break;
            case 'create_file':
                $this->handle_create_file();
                break;
            case 'upload':
                $this->handle_upload();
                break;
            case 'delete':
                $this->handle_delete();
                break;
            case 'rename':
                $this->handle_rename();
                break;
            case 'duplicate':
                $this->handle_duplicate();
                break;
            case 'copy':
                $this->handle_copy();
                break;
            case 'move':
                $this->handle_move();
                break;
            case 'download':
                $this->handle_download();
                break;
            case 'prepare_zip':
                $this->handle_prepare_zip();
                break;
            case 'download_zip':
                $this->handle_download_zip();
                break;
            case 'compress':
                $this->handle_compress();
                break;
            case 'extract':
                $this->handle_extract();
                break;
            case 'preview':
                $this->handle_preview();
                break;
            case 'save':
                $this->handle_save();
                break;
            case 'get_permissions':
                $this->handle_get_permissions();
                break;
            case 'set_permissions':
                $this->handle_set_permissions();
                break;
            case 'batch_rename':
                $this->handle_batch_rename();
                break;
            default:
                wp_send_json_error( array( 'message' => 'Unknown action.' ) );
        }
    }

    private function handle_list() {
        $path   = isset( $_REQUEST['path'] ) ? sanitize_text_field( $_REQUEST['path'] ) : '';
        $result = $this->file_ops->list_directory( $path );

        if ( is_wp_error( $result ) ) {
            wp_send_json_error( array( 'message' => $result->get_error_message() ) );
        }

        wp_send_json_success( array( 'items' => $result, 'path' => $path ) );
    }

    private function handle_tree() {
        $path   = isset( $_REQUEST['path'] ) ? sanitize_text_field( $_REQUEST['path'] ) : '';
        $result = $this->file_ops->get_folder_tree( $path );

        if ( is_wp_error( $result ) ) {
            wp_send_json_error( array( 'message' => $result->get_error_message() ) );
        }

        wp_send_json_success( array( 'tree' => $result ) );
    }

    private function handle_create_folder() {
        $path = isset( $_POST['path'] ) ? sanitize_text_field( $_POST['path'] ) : '';
        $name = isset( $_POST['name'] ) ? sanitize_text_field( $_POST['name'] ) : '';

        $result = $this->file_ops->create_folder( $path, $name );

        if ( is_wp_error( $result ) ) {
            wp_send_json_error( array( 'message' => $result->get_error_message() ) );
        }

        wp_send_json_success( array( 'message' => 'Folder created.', 'data' => $result ) );
    }

    private function handle_create_file() {
        $path = isset( $_POST['path'] ) ? sanitize_text_field( $_POST['path'] ) : '';
        $name = isset( $_POST['name'] ) ? sanitize_text_field( $_POST['name'] ) : '';

        $result = $this->file_ops->create_file( $path, $name );

        if ( is_wp_error( $result ) ) {
            wp_send_json_error( array( 'message' => $result->get_error_message() ) );
        }

        wp_send_json_success( array( 'message' => 'File created.', 'data' => $result ) );
    }

    private function handle_upload() {
        $path      = isset( $_POST['path'] ) ? sanitize_text_field( $_POST['path'] ) : '';
        $overwrite = ! empty( $_POST['overwrite'] ) && 'true' === $_POST['overwrite'];

        if ( empty( $_FILES['files'] ) ) {
            wp_send_json_error( array( 'message' => 'No files uploaded.' ) );
        }

        $result = $this->file_ops->upload_files( $path, $_FILES['files'], $overwrite );

        if ( is_wp_error( $result ) ) {
            wp_send_json_error( array( 'message' => $result->get_error_message() ) );
        }

        $msg = count( $result['uploaded'] ) . ' file(s) uploaded.';
        if ( ! empty( $result['errors'] ) ) {
            $msg .= ' Errors: ' . implode( '; ', $result['errors'] );
        }

        wp_send_json_success( array( 'message' => $msg, 'data' => $result ) );
    }

    private function handle_delete() {
        $paths = array();

        if ( isset( $_POST['paths'] ) && is_array( $_POST['paths'] ) ) {
            $paths = array_map( 'sanitize_text_field', $_POST['paths'] );
        } elseif ( isset( $_POST['path'] ) ) {
            $paths = array( sanitize_text_field( $_POST['path'] ) );
        }

        if ( empty( $paths ) ) {
            wp_send_json_error( array( 'message' => 'No path specified.' ) );
        }

        $errors = array();
        foreach ( $paths as $path ) {
            $result = $this->file_ops->delete( $path );
            if ( is_wp_error( $result ) ) {
                $errors[] = basename( $path ) . ': ' . $result->get_error_message();
            }
        }

        if ( ! empty( $errors ) ) {
            wp_send_json_error( array( 'message' => implode( '; ', $errors ) ) );
        }

        wp_send_json_success( array( 'message' => count( $paths ) . ' item(s) deleted.' ) );
    }

    private function handle_rename() {
        $path     = isset( $_POST['path'] ) ? sanitize_text_field( $_POST['path'] ) : '';
        $new_name = isset( $_POST['new_name'] ) ? sanitize_text_field( $_POST['new_name'] ) : '';

        $result = $this->file_ops->rename( $path, $new_name );

        if ( is_wp_error( $result ) ) {
            wp_send_json_error( array( 'message' => $result->get_error_message() ) );
        }

        wp_send_json_success( array( 'message' => 'Renamed successfully.', 'data' => $result ) );
    }

    private function handle_duplicate() {
        $path   = isset( $_POST['path'] ) ? sanitize_text_field( $_POST['path'] ) : '';
        $result = $this->file_ops->duplicate( $path );

        if ( is_wp_error( $result ) ) {
            wp_send_json_error( array( 'message' => $result->get_error_message() ) );
        }

        wp_send_json_success( array( 'message' => 'Duplicated successfully.', 'data' => $result ) );
    }

    private function handle_copy() {
        $source    = isset( $_POST['source'] ) ? sanitize_text_field( $_POST['source'] ) : '';
        $dest      = isset( $_POST['destination'] ) ? sanitize_text_field( $_POST['destination'] ) : '';
        $overwrite = ! empty( $_POST['overwrite'] ) && 'true' === $_POST['overwrite'];

        $result = $this->file_ops->copy( $source, $dest, $overwrite );

        if ( is_wp_error( $result ) ) {
            $code = $result->get_error_code();
            wp_send_json_error( array(
                'message' => $result->get_error_message(),
                'code'    => $code,
            ) );
        }

        wp_send_json_success( array( 'message' => 'Copied successfully.', 'data' => $result ) );
    }

    private function handle_move() {
        $source    = isset( $_POST['source'] ) ? sanitize_text_field( $_POST['source'] ) : '';
        $dest      = isset( $_POST['destination'] ) ? sanitize_text_field( $_POST['destination'] ) : '';
        $overwrite = ! empty( $_POST['overwrite'] ) && 'true' === $_POST['overwrite'];

        $result = $this->file_ops->move( $source, $dest, $overwrite );

        if ( is_wp_error( $result ) ) {
            $code = $result->get_error_code();
            wp_send_json_error( array(
                'message' => $result->get_error_message(),
                'code'    => $code,
            ) );
        }

        wp_send_json_success( array( 'message' => 'Moved successfully.', 'data' => $result ) );
    }

    private function handle_download() {
        $path   = isset( $_GET['path'] ) ? sanitize_text_field( $_GET['path'] ) : '';
        $result = $this->file_ops->get_file_url( $path );

        if ( is_wp_error( $result ) ) {
            wp_send_json_error( array( 'message' => $result->get_error_message() ) );
        }

        $file_path = $result['path'];
        $file_name = $result['name'];
        $mime      = wp_check_filetype( $file_name )['type'] ?: 'application/octet-stream';

        while ( ob_get_level() > 0 ) {
            ob_end_clean();
        }

        header( 'Content-Description: File Transfer' );
        header( 'Content-Type: ' . $mime );
        header( 'Content-Disposition: attachment; filename="' . $file_name . '"' );
        header( 'Content-Length: ' . filesize( $file_path ) );
        header( 'Cache-Control: must-revalidate' );
        header( 'Pragma: public' );

        readfile( $file_path );
        exit;
    }

    /**
     * Step 1 of bulk/folder download: create temp zip, store path in transient, return key.
     */
    private function handle_prepare_zip() {
        $paths = array();

        if ( isset( $_POST['paths'] ) && is_array( $_POST['paths'] ) ) {
            $paths = array_map( 'sanitize_text_field', $_POST['paths'] );
        } elseif ( isset( $_POST['path'] ) ) {
            $paths = array( sanitize_text_field( $_POST['path'] ) );
        }

        if ( empty( $paths ) ) {
            wp_send_json_error( array( 'message' => 'No paths specified.' ) );
        }

        $tmp_path = $this->file_ops->create_download_zip( $paths );

        if ( is_wp_error( $tmp_path ) ) {
            wp_send_json_error( array( 'message' => $tmp_path->get_error_message() ) );
        }

        $key = wp_generate_password( 32, false );
        set_transient( 'dfm_zip_' . $key, $tmp_path, 300 ); // 5-minute TTL

        wp_send_json_success( array( 'key' => $key ) );
    }

    /**
     * Step 2: serve the pre-built zip identified by its transient key.
     */
    private function handle_download_zip() {
        $key = isset( $_GET['key'] ) ? sanitize_text_field( $_GET['key'] ) : '';
        if ( empty( $key ) ) {
            wp_die( 'Invalid download key.' );
        }

        $tmp_path = get_transient( 'dfm_zip_' . $key );
        if ( ! $tmp_path || ! file_exists( $tmp_path ) ) {
            wp_die( 'Download link has expired or is invalid.' );
        }

        delete_transient( 'dfm_zip_' . $key );

        while ( ob_get_level() > 0 ) {
            ob_end_clean();
        }

        header( 'Content-Description: File Transfer' );
        header( 'Content-Type: application/zip' );
        header( 'Content-Disposition: attachment; filename="download.zip"' );
        header( 'Content-Length: ' . filesize( $tmp_path ) );
        header( 'Cache-Control: must-revalidate' );
        header( 'Pragma: public' );

        readfile( $tmp_path );
        @unlink( $tmp_path );
        exit;
    }

    private function handle_compress() {
        $paths        = array();
        $dest         = isset( $_POST['destination'] ) ? sanitize_text_field( $_POST['destination'] ) : '';
        $archive_name = isset( $_POST['archive_name'] ) ? sanitize_text_field( $_POST['archive_name'] ) : 'archive';

        if ( isset( $_POST['paths'] ) && is_array( $_POST['paths'] ) ) {
            $paths = array_map( 'sanitize_text_field', $_POST['paths'] );
        } elseif ( isset( $_POST['path'] ) ) {
            $paths = array( sanitize_text_field( $_POST['path'] ) );
        }

        if ( empty( $paths ) ) {
            wp_send_json_error( array( 'message' => 'No items selected.' ) );
        }

        $result = $this->file_ops->compress_items( $paths, $dest, $archive_name );

        if ( is_wp_error( $result ) ) {
            wp_send_json_error( array( 'message' => $result->get_error_message() ) );
        }

        wp_send_json_success( array( 'message' => 'Archive created.', 'data' => $result ) );
    }

    private function handle_extract() {
        $path = isset( $_POST['path'] ) ? sanitize_text_field( $_POST['path'] ) : '';
        $dest = isset( $_POST['destination'] ) ? sanitize_text_field( $_POST['destination'] ) : '';

        // Default: extract alongside the archive.
        if ( '' === $dest ) {
            $dest = dirname( $path );
        }

        $result = $this->file_ops->extract_archive( $path, $dest );

        if ( is_wp_error( $result ) ) {
            wp_send_json_error( array( 'message' => $result->get_error_message() ) );
        }

        wp_send_json_success( array( 'message' => 'Extracted successfully.', 'data' => $result ) );
    }

    private function handle_preview() {
        $path   = isset( $_REQUEST['path'] ) ? sanitize_text_field( $_REQUEST['path'] ) : '';
        $result = $this->file_ops->get_file_content( $path );

        if ( is_wp_error( $result ) ) {
            $url_result = $this->file_ops->get_file_url( $path );
            if ( is_wp_error( $url_result ) ) {
                wp_send_json_error( array( 'message' => $result->get_error_message() ) );
            }

            wp_send_json_success( array(
                'preview_type' => 'download',
                'url'          => $url_result['url'],
                'name'         => $url_result['name'],
                'message'      => $result->get_error_message(),
            ) );
            return;
        }

        $mime = $result['mime'] ?: '';

        if ( strpos( $mime, 'image/' ) === 0 ) {
            $url_result = $this->file_ops->get_file_url( $path );
            wp_send_json_success( array(
                'preview_type' => 'image',
                'url'          => is_wp_error( $url_result ) ? '' : $url_result['url'],
                'name'         => $result['name'],
                'size'         => $result['size'],
                'mime'         => $mime,
            ) );
        } elseif (
            strpos( $mime, 'text/' ) === 0 ||
            in_array( $mime, array( 'application/json', 'application/xml', 'application/javascript', 'application/x-httpd-php' ), true ) ||
            empty( $mime )
        ) {
            wp_send_json_success( array(
                'preview_type' => 'text',
                'content'      => $result['content'],
                'name'         => $result['name'],
                'size'         => $result['size'],
                'mime'         => $mime,
            ) );
        } elseif ( strpos( $mime, 'video/' ) === 0 ) {
            $url_result = $this->file_ops->get_file_url( $path );
            wp_send_json_success( array(
                'preview_type' => 'video',
                'url'          => is_wp_error( $url_result ) ? '' : $url_result['url'],
                'name'         => $result['name'],
                'size'         => $result['size'],
                'mime'         => $mime,
            ) );
        } elseif ( strpos( $mime, 'audio/' ) === 0 ) {
            $url_result = $this->file_ops->get_file_url( $path );
            wp_send_json_success( array(
                'preview_type' => 'audio',
                'url'          => is_wp_error( $url_result ) ? '' : $url_result['url'],
                'name'         => $result['name'],
                'size'         => $result['size'],
                'mime'         => $mime,
            ) );
        } else {
            $url_result = $this->file_ops->get_file_url( $path );
            wp_send_json_success( array(
                'preview_type' => 'download',
                'url'          => is_wp_error( $url_result ) ? '' : $url_result['url'],
                'name'         => $result['name'],
                'size'         => $result['size'],
                'mime'         => $mime,
            ) );
        }
    }

    private function handle_save() {
        $path    = isset( $_POST['path'] ) ? sanitize_text_field( $_POST['path'] ) : '';
        $content = isset( $_POST['content'] ) ? wp_unslash( $_POST['content'] ) : '';

        $result = $this->file_ops->save_file_content( $path, $content );

        if ( is_wp_error( $result ) ) {
            wp_send_json_error( array( 'message' => $result->get_error_message() ) );
        }

        wp_send_json_success( array( 'message' => 'File saved.', 'data' => $result ) );
    }

    private function handle_get_permissions() {
        $path   = isset( $_REQUEST['path'] ) ? sanitize_text_field( $_REQUEST['path'] ) : '';
        $result = $this->file_ops->get_permissions( $path );

        if ( is_wp_error( $result ) ) {
            wp_send_json_error( array( 'message' => $result->get_error_message() ) );
        }

        wp_send_json_success( $result );
    }

    private function handle_set_permissions() {
        $path = isset( $_POST['path'] ) ? sanitize_text_field( $_POST['path'] ) : '';
        $mode = isset( $_POST['mode'] ) ? sanitize_text_field( $_POST['mode'] ) : '';

        $result = $this->file_ops->set_permissions( $path, $mode );

        if ( is_wp_error( $result ) ) {
            wp_send_json_error( array( 'message' => $result->get_error_message() ) );
        }

        wp_send_json_success( array( 'message' => 'Permissions updated.', 'data' => $result ) );
    }

    private function handle_batch_rename() {
        $paths     = array();
        $find      = isset( $_POST['find'] ) ? wp_unslash( $_POST['find'] ) : '';
        $replace   = isset( $_POST['replace'] ) ? wp_unslash( $_POST['replace'] ) : '';
        $use_regex = ! empty( $_POST['use_regex'] ) && 'true' === $_POST['use_regex'];

        if ( isset( $_POST['paths'] ) && is_array( $_POST['paths'] ) ) {
            $paths = array_map( 'sanitize_text_field', $_POST['paths'] );
        }

        if ( empty( $paths ) ) {
            wp_send_json_error( array( 'message' => 'No items selected.' ) );
        }

        $result = $this->file_ops->batch_rename( $paths, $find, $replace, $use_regex );

        $renamed = count( $result['renamed'] );
        $errors  = $result['errors'];

        $msg = $renamed . ' item(s) renamed.';
        if ( ! empty( $errors ) ) {
            $msg .= ' Errors: ' . implode( '; ', $errors );
        }

        wp_send_json_success( array( 'message' => $msg, 'data' => $result ) );
    }
}
