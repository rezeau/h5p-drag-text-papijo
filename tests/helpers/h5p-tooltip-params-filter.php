<?php

$corePath = $argv[1];
$semanticsPath = $argv[2];
require_once $corePath;

class DragTextPapiJoParamsFramework {
  public $errors = array();

  public function t($message, $replacements = array()) {
    return strtr($message, $replacements);
  }

  public function setErrorMessage($message, $code = null) {
    $this->errors[] = $message;
  }
}

class DragTextPapiJoParamsCore {
  public $relativePathRegExp = '/^((\.\.\/){1,2})(.*content\/)?(\d+|editor)\/(.+)$/';
}

$value = json_decode(stream_get_contents(STDIN));
$semantics = json_decode(file_get_contents($semanticsPath));
$framework = new DragTextPapiJoParamsFramework();
$validatorClass = class_exists('H5PContentValidator') ?
  'H5PContentValidator' : 'Moodle\\H5PContentValidator';
$validator = new $validatorClass($framework, new DragTextPapiJoParamsCore());
$validator->validateGroup($value, (object) array('fields' => $semantics));

echo json_encode(array(
  'errors' => $framework->errors,
  'value' => $value,
));
