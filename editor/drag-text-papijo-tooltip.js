(function (H5PEditor) {
  'use strict';

  var LIBRARY_NAME = 'H5PEditor.DragTextPapiJoTooltip';
  var EVENT_NAMESPACE = '.dragTextPapiJoTooltip';
  var IMAGE_FIELD = {
    name: 'image', type: 'image', label: 'Tooltip image', optional: true,
    disableCopyright: true
  };
  var uiCounter = 0;

  function translate(key, replacements) {
    return H5PEditor.t(LIBRARY_NAME, key, replacements || {});
  }

  function encode(value) {
    return typeof H5PEditor.htmlspecialchars === 'function' ?
      H5PEditor.htmlspecialchars(value) : value;
  }

  function decode(value) {
    if (typeof document === 'undefined') {
      return value;
    }
    var textarea = document.createElement('textarea');
    textarea.innerHTML = typeof value === 'string' ? value : '';
    return textarea.value;
  }

  function getStore(widget) {
    if (!widget.parent || !Array.isArray(widget.parent.children)) {
      return null;
    }
    return widget.parent.children.find(function (child) {
      return child instanceof TooltipImagesStore ||
        (child.field && child.field.name === 'tooltipImages' &&
          typeof child.replaceAll === 'function');
    }) || null;
  }

  function getTextWidget(store) {
    if (!store.parent || !Array.isArray(store.parent.children)) {
      return null;
    }
    return store.parent.children.find(function (child) {
      return child instanceof DragTextPapiJoTooltip;
    }) || null;
  }

  function TooltipImagesStore(parent, field, params, setValue) {
    this.parent = parent;
    this.field = field;
    this.params = Array.isArray(params) ?
      H5PEditor.DragTextPapiJoTooltipModel.clone(params) : [];
    this.setValue = setValue;
  }

  TooltipImagesStore.prototype.appendTo = function ($wrapper) {
    this.$item = H5PEditor.$('<div>', {
      'class': 'papijo-dragtext-tooltip-store', hidden: true
    }).appendTo($wrapper);
  };

  TooltipImagesStore.prototype.getUnique = function (id) {
    var matches = this.params.filter(function (definition) {
      return definition && definition.id === id;
    });
    return matches.length === 1 ? matches[0] : null;
  };

  TooltipImagesStore.prototype.replaceAll = function (definitions) {
    this.params = H5PEditor.DragTextPapiJoTooltipModel.clone(
      Array.isArray(definitions) ? definitions : []
    );
    this.setValue(this.field, this.params.length ?
      H5PEditor.DragTextPapiJoTooltipModel.clone(this.params) : undefined);
  };

  TooltipImagesStore.prototype.validate = function () {
    var widget = getTextWidget(this);
    if (!widget) {
      return true;
    }
    var analysis = H5PEditor.DragTextPapiJoTooltipModel.analyze(
      widget.getCanonicalSource(), this.params
    );
    var invalid = analysis.gaps.some(function (gap) {
      if (gap.association.status !== 'valid') {
        return false;
      }
      var definition = gap.definition;
      return definition && (!definition.image ||
        typeof definition.image.path !== 'string' ||
        definition.image.path.trim() === '' ||
        typeof definition.alt !== 'string' || definition.alt.trim() === '');
    });
    if (!invalid && analysis.safeToReconcile && analysis.orphans.length) {
      this.replaceAll(H5PEditor.DragTextPapiJoTooltipModel.reconcileOrphans(
        widget.getCanonicalSource(), this.params
      ));
      widget.refreshTooltipPanel();
    }
    return !invalid;
  };

  TooltipImagesStore.prototype.remove = function () {
    if (this.$item) {
      this.$item.remove();
    }
  };

  function DragTextPapiJoTooltip(parent, field, params, setValue) {
    H5PEditor.Textarea.call(this, parent, field, params, setValue);
    this.canonicalSource = typeof params === 'string' ? params : '';
    this.projection = { display: this.canonicalSource, mappings: [] };
    this.imageWidgetGeneration = 0;
    this.formMode = null;
  }

  DragTextPapiJoTooltip.prototype = Object.create(H5PEditor.Textarea.prototype);
  DragTextPapiJoTooltip.prototype.constructor = DragTextPapiJoTooltip;

  DragTextPapiJoTooltip.prototype.getCanonicalSource = function () {
    if (this.$input) {
      this.canonicalSource = H5PEditor.DragTextPapiJoTooltipModel.restoreSource(
        this.$input.val(), this.projection.mappings
      );
    }
    return this.canonicalSource;
  };

  DragTextPapiJoTooltip.prototype.setCanonicalSource = function (source) {
    this.canonicalSource = source;
    this.setValue(this.field, encode(source));
    this.renderProjection();
    this.refreshTooltipPanel();
  };

  DragTextPapiJoTooltip.prototype.renderProjection = function () {
    this.projection = H5PEditor.DragTextPapiJoTooltipModel.projectSource(
      this.canonicalSource, translate('tooltipImage')
    );
    if (this.$input) {
      this.$input.val(this.projection.display);
    }
  };

  DragTextPapiJoTooltip.prototype.appendTo = function ($wrapper) {
    var self = this;
    H5PEditor.Textarea.prototype.appendTo.call(this, $wrapper);
    this.$input.off('change');
    this.canonicalSource = decode(this.canonicalSource);
    this.renderProjection();
    this.$input.on('input' + EVENT_NAMESPACE + ' change' + EVENT_NAMESPACE, function () {
      self.closeForm();
      self.canonicalSource = H5PEditor.DragTextPapiJoTooltipModel.restoreSource(
        self.$input.val(), self.projection.mappings
      );
      self.setValue(self.field, encode(self.canonicalSource));
      self.refreshTooltipPanel();
    });
    this.createTooltipPanel();
    this.refreshTooltipPanel();
    if (this.parent && typeof this.parent.ready === 'function') {
      this.parent.ready(function () {
        // H5P appends a field before adding it to parent.children. Wait until
        // every sibling, including tooltipImages, has joined the field tree.
        if (self.$gapList) {
          self.refreshTooltipPanel();
        }
      });
    }
  };

  DragTextPapiJoTooltip.prototype.createTooltipPanel = function () {
    var headingId = 'papijo-dragtext-tooltips-' + (++uiCounter);
    this.panelHeadingId = headingId;
    this.$panelStatus = H5PEditor.$('<p>', {
      'class': 'papijo-dragtext-tooltip-status',
      'aria-live': 'polite'
    });
    this.$gapList = H5PEditor.$('<ol>', {
      'class': 'papijo-dragtext-tooltip-list'
    });
    this.$panel = H5PEditor.$('<section>', {
      'class': 'papijo-dragtext-tooltip-panel',
      'aria-labelledby': headingId
    }).append(
      H5PEditor.$('<h3>', { id: headingId, text: translate('panelHeading') }),
      H5PEditor.$('<p>', { text: translate('panelDescription') }),
      this.$panelStatus,
      this.$gapList
    ).appendTo(this.$item);
  };

  DragTextPapiJoTooltip.prototype.warningForGap = function (gap) {
    if (gap.diagnostics.length || gap.association.status === 'malformed') {
      return translate('malformedReference');
    }
    if (gap.association.status === 'duplicate' || gap.association.status === 'ambiguous') {
      return translate('duplicateReference');
    }
    if (gap.definitionStatus === 'duplicate') {
      return translate('duplicateDefinition');
    }
    if (gap.association.status === 'valid' && gap.definitionStatus === 'missing') {
      return translate('missingDefinition');
    }
    return '';
  };

  DragTextPapiJoTooltip.prototype.isGapUnsafe = function (gap) {
    return gap.diagnostics.length > 0 || gap.tips.length > 1 ||
      gap.association.status === 'malformed' ||
      gap.association.status === 'duplicate' ||
      gap.association.status === 'ambiguous' ||
      gap.definitionStatus === 'duplicate';
  };

  DragTextPapiJoTooltip.prototype.refreshTooltipPanel = function () {
    if (!this.$gapList) {
      return;
    }
    var self = this;
    var store = getStore(this);
    var definitions = store ? store.params : [];
    var source = this.getCanonicalSource();
    var analysis = H5PEditor.DragTextPapiJoTooltipModel.analyze(source, definitions);
    this.$gapList.empty();
    this.$panelStatus.text(analysis.diagnostics.length ?
      translate('malformedSource') :
      (analysis.orphans.length ? translate('orphanDefinitions', {
        ':count': analysis.orphans.length
      }) : ''));
    analysis.gaps.forEach(function (gap) {
      var warning = self.warningForGap(gap);
      var label = translate('gapLabel', { ':index': gap.index + 1 });
      var gapHeadingId = self.panelHeadingId + '-gap-' + (gap.index + 1);
      var $item = H5PEditor.$('<li>', {
        'class': 'papijo-dragtext-tooltip-gap'
      });
      H5PEditor.$('<h4>', {
        'class': 'papijo-dragtext-tooltip-gap-heading',
        id: gapHeadingId
      }).append(
        H5PEditor.$('<span>', { text: label }),
        H5PEditor.$('<code>', {
          'class': 'papijo-dragtext-tooltip-preview',
          text: gap.preview || translate('emptyAnswer')
        })
      ).appendTo($item);
      if (warning) {
        H5PEditor.$('<p>', {
          'class': 'papijo-dragtext-tooltip-warning',
          role: 'alert', text: warning
        }).appendTo($item);
      }
      var unsafe = self.isGapUnsafe(gap);
      var hasTooltip = gap.tips.length === 1 || gap.association.status === 'valid';
      var $button = H5PEditor.$('<button>', {
        type: 'button',
        'class': hasTooltip ? 'papijo-dragtext-tooltip-edit' :
          'papijo-dragtext-tooltip-add',
        text: hasTooltip ? translate('editTooltip') : translate('addTooltip'),
        'aria-label': (hasTooltip ? translate('editTooltip') : translate('addTooltip')) +
          ': ' + label,
        disabled: unsafe
      }).appendTo($item);
      $button.on('click' + EVENT_NAMESPACE, function () {
        self.openForm(gap.index);
      });
      if (hasTooltip) {
        H5PEditor.$('<button>', {
          type: 'button', 'class': 'papijo-dragtext-tooltip-remove',
          text: translate('removeTooltip'),
          'aria-label': translate('removeTooltip') + ': ' + label,
          disabled: unsafe
        }).appendTo($item).on('click' + EVENT_NAMESPACE, function () {
          self.removeTooltip(gap.index);
        });
      }
      self.$gapList.append($item);
    });
  };

  DragTextPapiJoTooltip.prototype.openForm = function (gapIndex) {
    var analysis = H5PEditor.DragTextPapiJoTooltipModel.analyze(
      this.getCanonicalSource(), (getStore(this) || { params: [] }).params
    );
    var gap = analysis.gaps[gapIndex];
    if (!gap || this.isGapUnsafe(gap)) {
      this.$panelStatus.text(translate('unableToEdit'));
      return;
    }
    this.closeForm();
    this.formMode = 'edit';
    this.formGapIndex = gapIndex;
    this.formLegacy = gap.legacyImage;
    this.replaceLegacy = false;
    this.imageDraft = gap.definition ?
      H5PEditor.DragTextPapiJoTooltipModel.clone(gap.definition.image) : undefined;
    this.formId = 'papijo-dragtext-tooltip-form-' + (++uiCounter);
    this.$formStatus = H5PEditor.$('<p>', {
      'class': 'papijo-dragtext-tooltip-form-status',
      'aria-live': 'polite'
    });
    this.$textInput = H5PEditor.$('<textarea>', {
      rows: 2,
      'class': 'papijo-dragtext-tooltip-text'
    }).val(gap.tips.length === 1 ? gap.tips[0].content : '');
    this.$altInput = H5PEditor.$('<input>', {
      type: 'text',
      'class': 'papijo-dragtext-tooltip-alt',
      value: gap.definition ? gap.definition.alt : ''
    });
    this.$imageField = H5PEditor.$('<div>', {
      'class': 'papijo-dragtext-tooltip-image-field'
    });
    var self = this;
    var $cancel = H5PEditor.$('<button>', {
      type: 'button', text: translate('cancel')
    }).on('click' + EVENT_NAMESPACE, function () { self.closeForm(true); });
    this.$form = H5PEditor.$('<form>', {
      id: this.formId,
      'class': 'papijo-dragtext-tooltip-form',
      'aria-labelledby': this.panelHeadingId + '-gap-' + (gapIndex + 1)
    }).append(
      H5PEditor.$('<label>', { text: translate('tooltipText') }).append(this.$textInput),
      this.$imageField,
      this.$altField = H5PEditor.$('<label>', {
        text: translate('imageAltText')
      }).append(this.$altInput),
      H5PEditor.$('<button>', { type: 'submit', text: translate('applyTooltip') }),
      $cancel,
      this.$formStatus
    ).appendTo(this.$gapList.children().eq(gapIndex));
    if (gap.legacyImage) {
      this.$imageField.prop('hidden', true);
      H5PEditor.$('<p>', {
        'class': 'papijo-dragtext-tooltip-warning',
        text: translate('legacyImageDetected')
      }).prependTo(this.$form);
      H5PEditor.$('<button>', {
        type: 'button', text: translate('replaceLegacyImage')
      }).insertBefore($cancel).on('click' + EVENT_NAMESPACE, function () {
        self.replaceLegacy = true;
        self.$imageField.prop('hidden', false);
        self.mountImageWidget();
      });
    }
    else {
      this.mountImageWidget();
    }
    this.$removeImage = H5PEditor.$('<button>', {
      type: 'button',
      'class': 'papijo-dragtext-tooltip-remove-image',
      text: translate('removeImage')
    }).insertBefore($cancel).on('click' + EVENT_NAMESPACE, function () {
      self.imageDraft = undefined;
      self.$altInput.val('');
      self.mountImageWidget();
      self.$formStatus.text(translate('imageRemovedPending'));
    });
    this.syncImageControls();
    this.$form.on('submit' + EVENT_NAMESPACE, function (event) {
      event.preventDefault();
      self.applyForm();
    });
    this.$textInput.trigger('focus');
  };

  DragTextPapiJoTooltip.prototype.acceptImageValue = function (widget, generation, value) {
    if (this.imageWidget !== widget || this.imageWidgetGeneration !== generation ||
        !this.formMode) {
      return false;
    }
    this.imageDraft = H5PEditor.DragTextPapiJoTooltipModel.clone(value);
    this.syncImageControls();
    return true;
  };

  DragTextPapiJoTooltip.prototype.syncImageControls = function () {
    var hasImage = this.imageDraft && typeof this.imageDraft.path === 'string' &&
      this.imageDraft.path.trim() !== '';
    if (this.$altField) {
      this.$altField.prop('hidden', !hasImage);
    }
    if (this.$removeImage) {
      this.$removeImage.prop('hidden', !hasImage);
    }
  };

  DragTextPapiJoTooltip.prototype.mountImageWidget = function () {
    var self = this;
    this.destroyImageWidget(true);
    if (!H5PEditor.widgets.image || !this.$imageField ||
        (this.formLegacy && !this.replaceLegacy)) {
      return;
    }
    var generation = this.imageWidgetGeneration;
    var widget;
    var imageField = H5PEditor.DragTextPapiJoTooltipModel.clone(IMAGE_FIELD);
    imageField.label = translate('tooltipImage');
    var imageParent = {
      library: this.parent && this.parent.library || 'H5P.DragTextPapiJo',
      ready: function (callback) { callback(); }
    };
    widget = new H5PEditor.widgets.image(
      imageParent,
      imageField,
      H5PEditor.DragTextPapiJoTooltipModel.clone(this.imageDraft),
      function (_field, value) {
        self.acceptImageValue(widget, generation, value);
      }
    );
    this.imageWidget = widget;
    widget.appendTo(this.$imageField);
    // H5P's image widget has no supported switch for its Crop/Rotate editor.
    // Remove only this instance's generated trigger; upload and replace remain.
    if (widget.$editImage && typeof widget.$editImage.remove === 'function') {
      widget.$editImage.remove();
    }
    this.syncImageControls();
  };

  DragTextPapiJoTooltip.prototype.destroyImageWidget = function (preserveDraft) {
    var widget = this.imageWidget;
    this.imageWidget = null;
    this.imageWidgetGeneration++;
    if (widget && typeof widget.remove === 'function') {
      widget.remove();
    }
    if (this.$imageField) {
      this.$imageField.empty();
    }
    if (!preserveDraft) {
      this.imageDraft = undefined;
    }
  };

  DragTextPapiJoTooltip.prototype.applyForm = function () {
    var store = getStore(this);
    var result = H5PEditor.DragTextPapiJoTooltipModel.applyTooltip({
      source: this.getCanonicalSource(),
      definitions: store ? store.params : [],
      gapIndex: this.formGapIndex,
      text: this.$textInput.val(),
      image: this.imageDraft,
      alt: this.$altInput.val(),
      replaceLegacy: this.replaceLegacy
    });
    if (!result.valid) {
      var key = result.reason === 'alt-required' ? 'altRequired' :
        (result.reason === 'legacy-replacement-required' ?
          'legacyReplacementRequired' :
          (result.reason === 'tooltip-required' ? 'tooltipRequired' : 'unableToEdit'));
      this.$formStatus.text(translate(key));
      return;
    }
    if (result.definitions.length && !store) {
      this.$formStatus.text(translate('imageStoreUnavailable'));
      return;
    }
    if (store) {
      store.replaceAll(result.definitions);
    }
    this.closeForm();
    this.setCanonicalSource(result.source);
    this.$panelStatus.text(translate('tooltipUpdated'));
  };

  DragTextPapiJoTooltip.prototype.removeTooltip = function (gapIndex) {
    var store = getStore(this);
    var result = H5PEditor.DragTextPapiJoTooltipModel.removeTooltip({
      source: this.getCanonicalSource(),
      definitions: store ? store.params : [],
      gapIndex: gapIndex
    });
    if (!result.valid) {
      this.$panelStatus.text(translate('unableToEdit'));
      return;
    }
    if (store) {
      store.replaceAll(result.definitions);
    }
    this.setCanonicalSource(result.source);
    this.$panelStatus.text(translate('tooltipRemoved'));
  };

  DragTextPapiJoTooltip.prototype.closeForm = function (restoreFocus) {
    if (!this.$form) {
      return;
    }
    var gapIndex = this.formGapIndex;
    this.destroyImageWidget();
    this.$form.off(EVENT_NAMESPACE).remove();
    this.$form = null;
    this.$textInput = null;
    this.$altInput = null;
    this.$altField = null;
    this.$imageField = null;
    this.$removeImage = null;
    this.$formStatus = null;
    this.formMode = null;
    this.formGapIndex = null;
    this.formLegacy = false;
    this.replaceLegacy = false;
    if (restoreFocus && this.$gapList) {
      this.$gapList.children().eq(gapIndex).find('button').first().trigger('focus');
    }
  };

  DragTextPapiJoTooltip.prototype.validate = function () {
    var value = this.getCanonicalSource();
    var valid = value.trim().length > 0;
    var store = getStore(this);
    var analysis = H5PEditor.DragTextPapiJoTooltipModel.analyze(
      value, store ? store.params : []
    );
    valid = valid && analysis.diagnostics.length === 0 &&
      analysis.gaps.every(function (gap) {
        return gap.association.status !== 'malformed' &&
          gap.association.status !== 'ambiguous' &&
          gap.association.status !== 'duplicate' &&
          gap.definitionStatus !== 'duplicate';
      });
    this.$errors.html('');
    if (!valid) {
      this.$errors.append(H5PEditor.createError(translate('sourceValidationError')));
    }
    this.$input.toggleClass('error', !valid);
    return valid ? value : false;
  };

  DragTextPapiJoTooltip.prototype.remove = function () {
    this.destroyImageWidget();
    this.closeForm();
    if (this.$input) {
      this.$input.off(EVENT_NAMESPACE);
    }
    if (this.$gapList) {
      this.$gapList.find('button').off(EVENT_NAMESPACE);
    }
    H5PEditor.Textarea.prototype.remove.call(this);
    this.$panel = null;
    this.$gapList = null;
    this.$panelStatus = null;
    this.formMode = null;
  };

  DragTextPapiJoTooltip.TooltipImagesStore = TooltipImagesStore;
  H5PEditor.DragTextPapiJoTooltip = DragTextPapiJoTooltip;
  H5PEditor.widgets.dragTextPapiJoTooltip = DragTextPapiJoTooltip;
  H5PEditor.widgets.dragTextPapiJoTooltipImagesStore = TooltipImagesStore;
})(H5PEditor);
