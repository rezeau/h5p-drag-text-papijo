<?php

$corePath = $argv[1];
$videoSemanticsPath = $argv[2];

require_once $corePath;

class DragTextPapiJoMigrationFramework {
  public $errors = array();

  public function t($message, $replacements = array()) {
    return strtr($message, $replacements);
  }

  public function setErrorMessage($message, $code = null) {
    $this->errors[] = $message;
  }
}

class DragTextPapiJoMigrationCore {
  public $relativePathRegExp = '/a^/';
  private $videoSemanticsPath;

  public function __construct($videoSemanticsPath) {
    $this->videoSemanticsPath = $videoSemanticsPath;
  }

  public function loadLibrary($machineName, $majorVersion, $minorVersion) {
    return array(
      'machineName' => $machineName,
      'majorVersion' => $majorVersion,
      'minorVersion' => $minorVersion,
      'preloadedDependencies' => array(),
    );
  }

  public function loadLibrarySemantics($machineName, $majorVersion, $minorVersion) {
    return json_decode(file_get_contents($this->videoSemanticsPath));
  }

  public function findLibraryDependencies($dependencies, $library, $weight) {
    return $weight;
  }
}

$value = json_decode(stream_get_contents(STDIN));
$framework = new DragTextPapiJoMigrationFramework();
$core = new DragTextPapiJoMigrationCore($videoSemanticsPath);
$validator = new H5PContentValidator($framework, $core);
$validator->validateLibrary($value, (object) array(
  'options' => array('H5P.Video 1.6'),
));

echo json_encode(array(
  'value' => $value,
  'errors' => $framework->errors,
));
