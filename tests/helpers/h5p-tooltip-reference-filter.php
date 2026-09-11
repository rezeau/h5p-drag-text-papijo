<?php

$corePath = $argv[1];
require_once $corePath;

class DragTextPapiJoReferenceFramework {
  public function t($message, $replacements = array()) {
    return strtr($message, $replacements);
  }

  public function setErrorMessage($message, $code = null) {}
}

class DragTextPapiJoReferenceCore {}

$value = stream_get_contents(STDIN);
$validatorClass = class_exists('H5PContentValidator') ?
  'H5PContentValidator' : 'Moodle\\H5PContentValidator';
$validator = new $validatorClass(
  new DragTextPapiJoReferenceFramework(),
  new DragTextPapiJoReferenceCore()
);
$validator->validateText($value, (object) array(
  'name' => 'textField',
  'type' => 'text',
  'widget' => 'textarea'
));

echo $value;
