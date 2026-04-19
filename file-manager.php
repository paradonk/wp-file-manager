<?php
/**
 * Plugin Name: File Manager
 * Description: A full-featured file manager for wp-content/uploads/ with a modern SPA interface. Admin-only access.
 * Version: 1.2.2
 * Author: Paradorn Katananon
 * Author URI: www.data-civil.com
 * License: GPL-2.0-or-later
 * Text Domain: file-manager
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

define( 'DFM_VERSION', '1.2.2' );
define( 'DFM_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );
define( 'DFM_PLUGIN_URL', plugin_dir_url( __FILE__ ) );

require_once DFM_PLUGIN_DIR . 'includes/class-dfm-file-operations.php';
require_once DFM_PLUGIN_DIR . 'includes/class-dfm-ajax-handler.php';
require_once DFM_PLUGIN_DIR . 'includes/class-dfm-updater.php';

/** URL of the JSON metadata file on your server. */
define( 'DFM_UPDATE_URL', 'https://www.data-civil.com/updates/file-manager.json' );

final class Developer_File_Manager {

    private static $instance = null;

    public static function instance() {
        if ( null === self::$instance ) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    private function __construct() {
        add_action( 'admin_menu', array( $this, 'add_admin_menu' ) );
        add_action( 'admin_enqueue_scripts', array( $this, 'enqueue_assets' ) );

        new DFM_Ajax_Handler();
        new DFM_Updater( __FILE__, DFM_VERSION, DFM_UPDATE_URL );
    }

    public function add_admin_menu() {
        add_menu_page(
            __( 'File Manager', 'file-manager' ),
            __( 'File Manager', 'file-manager' ),
            'manage_options',
            'file-manager',
            array( $this, 'render_page' ),
            'dashicons-portfolio',
            4
        );
    }

    public function enqueue_assets( $hook ) {
        if ( 'toplevel_page_file-manager' !== $hook ) {
            return;
        }

        wp_enqueue_style(
            'dfm-admin',
            DFM_PLUGIN_URL . 'assets/css/dfm-admin.css',
            array( 'dashicons' ),
            DFM_VERSION
        );

        wp_enqueue_script(
            'dfm-admin',
            DFM_PLUGIN_URL . 'assets/js/dfm-admin.js',
            array(),
            DFM_VERSION,
            true
        );

        wp_localize_script( 'dfm-admin', 'dfmData', array(
            'ajaxUrl'           => admin_url( 'admin-ajax.php' ),
            'nonce'             => wp_create_nonce( 'dfm_nonce' ),
            'basePath'          => ABSPATH,
            'baseUrl'           => site_url( '/' ),
            'maxUploadSize'     => wp_max_upload_size(),
            'allowedExtensions' => array_keys( get_allowed_mime_types() ),
        ) );
    }

    public function render_page() {
        if ( ! current_user_can( 'manage_options' ) ) {
            wp_die( __( 'You do not have permission to access this page.', 'file-manager' ) );
        }
        ?>
        <div id="dfm-app" class="wrap">
            <h1 class="dfm-title">File Manager</h1>
            <div id="dfm-toolbar"></div>
            <div id="dfm-breadcrumb"></div>
            <div class="dfm-container">
                <div id="dfm-sidebar">
                    <div class="dfm-sidebar-header">Folders</div>
                    <div id="dfm-tree"></div>
                </div>
                <div id="dfm-main">
                    <div id="dfm-file-list"></div>
                    <div id="dfm-drop-overlay">
                        <div class="dfm-drop-message">
                            <span class="dashicons dashicons-upload"></span>
                            <p>Drop files here to upload</p>
                        </div>
                    </div>
                </div>
            </div>
            <div id="dfm-modal-backdrop"></div>
            <div id="dfm-modal"></div>
            <div id="dfm-context-menu"></div>
            <div id="dfm-toast-container"></div>
        </div>
        <?php
    }
}

add_action( 'plugins_loaded', array( 'Developer_File_Manager', 'instance' ) );
