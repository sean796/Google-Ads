<?php
/**
 * Google Drive deliverable upload (Drive API v3 multipart).
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

$neo_pulse_app_google_drive_upload_dir = __DIR__ . '/';
require_once $neo_pulse_app_google_drive_upload_dir . 'trait-google-drive-upload-folders.php';
require_once $neo_pulse_app_google_drive_upload_dir . 'trait-google-drive-upload-file-operations.php';
require_once $neo_pulse_app_google_drive_upload_dir . 'trait-google-drive-upload-upload.php';
require_once $neo_pulse_app_google_drive_upload_dir . 'trait-google-drive-upload-delivery-folder.php';
require_once $neo_pulse_app_google_drive_upload_dir . 'trait-google-drive-upload-delivery-subfolder.php';
require_once $neo_pulse_app_google_drive_upload_dir . 'trait-google-drive-upload-client-and-path-helpers.php';

class Neo_Pulse_App_Google_Drive_Upload {

	const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';
	const DRIVE_FILES_URL  = 'https://www.googleapis.com/drive/v3/files';
	const TEST_PARENT_FOLDER_ID = '1YrbOxNXBkYBp7GLGlUoSd07WGU8e0VEd';
	const TEST_SUBFOLDER_NAME   = 'Flowbie Connection Tests';
	const NEO_PULSE_WORKSPACE_FOLDER_NAME = 'NEO Pulse';

	use Neo_Pulse_App_Google_Drive_Upload_Trait_Folders;
	use Neo_Pulse_App_Google_Drive_Upload_Trait_File_Operations;
	use Neo_Pulse_App_Google_Drive_Upload_Trait_Upload;
	use Neo_Pulse_App_Google_Drive_Upload_Trait_Delivery_Folder;
	use Neo_Pulse_App_Google_Drive_Upload_Trait_Delivery_Subfolder;
	use Neo_Pulse_App_Google_Drive_Upload_Trait_Client_And_Path_Helpers;
}
