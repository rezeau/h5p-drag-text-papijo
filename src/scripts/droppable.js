H5P.TextDroppable = (function ($) {
  //CSS Main Containers:
  //Special Sub-containers:
  const SHOW_SOLUTION_CONTAINER = "h5p-drag-show-solution-container";

  //CSS Dropzone feedback:
  const CORRECT_FEEDBACK = 'h5p-drag-correct-feedback';
  const WRONG_FEEDBACK = 'h5p-drag-wrong-feedback';  
  const TRANSPARENT = '-transparent';

  //CSS Draggable feedback:
  const DRAGGABLE_FEEDBACK_CORRECT = 'h5p-drag-draggable-correct';
  const DRAGGABLE_FEEDBACK_WRONG = 'h5p-drag-draggable-wrong';

  /**
   * Private class for keeping track of droppable zones.
   * @private
   *
   * @param {String} text Correct text string for this drop box.
   * @param {undefined/String} tip Tip for this container, optional.
   * @param {jQuery} dropzone Dropzone object.
   * @param {jQuery} dropzoneContainer Container Container for the dropzone.
   * @param {number} index.
   * @param {Object} params Behavior settings
   */
  function Droppable(text, tip, correctFeedback, incorrectFeedback, removableBlock, dropzone, dropzoneContainer, index, params) {
    const self = this;
    self.text = text;
    self.tip = tip;
    self.correctFeedback = correctFeedback;
    self.incorrectFeedback = incorrectFeedback;
    self.removableBlock = removableBlock;
    self.index = index;
    self.params = params;
    /**
     * @type {H5P.TextDraggable}
     */
    self.containedDraggable = null;
    self.$dropzone = $(dropzone);
    if (self.removableBlock) {
      self.$dropzone.addClass('autowidth');
    }
    self.$dropzoneContainer = $(dropzoneContainer);

    if (self.tip) {
      self.$tip = H5P.JoubelUI.createTip(self.tip, {
        tipLabel: self.params.tipLabel,
        tabcontrol: true
      });
      self.$dropzoneContainer.addClass('has-tip');
      self.$dropzoneContainer.append(self.$tip);

      // toggle tabindex on tip, based on dropzone focus
      self.$dropzone.focus(() => self.$tip.attr('tabindex', '0'));
      self.$dropzone.blur(() => self.removeTipTabIndexIfNoFocus());
      self.$tip.blur(() => self.removeTipTabIndexIfNoFocus());
    }

    if (self.removableBlock) {
      self.$removableBlock = $('<div/>', {
        html: self.removableBlock,
        'class': 'removableblock'
      });
      self.$dropzone.prepend(self.$removableBlock);
    }

    self.$incorrectText = $('<div/>', {
      html: self.params.incorrectText + " " + self.params.correctAnswer,
      'class': 'correct-answer'
    });

    self.$correctText = $('<div/>', {
      html: self.params.correctText,
      'class': 'correct-answer'
    });

    self.$showSolution = $('<div/>', {
      'class': SHOW_SOLUTION_CONTAINER
    }).appendTo(self.$dropzoneContainer).hide();
    if (self.tip) {
      self.$showSolution.addClass('has-tip');
    }
  }

  Droppable.prototype.removeTipTabIndexIfNoFocus = function () {
    const self = this;

    setTimeout(() => {
      if (!self.$dropzone.is (':focus') && !self.$tip.is (':focus')) {
        self.$tip.attr('tabindex', '-1');
      }
    }, 0);
  };

  /**
   * Displays the solution next to the drop box if it is not correct.
   */
  Droppable.prototype.showSolution = function () {
    const correct = (this.containedDraggable !== null) && this.text.includes(this.containedDraggable.getAnswerText());
    if (!correct) {
      const solutiontxt = this.text.join(' | ');
      this.$showSolution.html(solutiontxt);
    }
    this.$showSolution.prepend(correct ? this.$correctText : this.$incorrectText);
    this.$showSolution.toggleClass('incorrect', !correct);
    this.$showSolution.show();
  };

  /**
   * Hides the solution.
   */
  Droppable.prototype.hideSolution = function () {
    this.$showSolution.html('');
    this.$showSolution.hide();
  };

  /**
   * Returns the html element
   *
   * @return {HTMLElement}
   */
  Droppable.prototype.getElement = function () {
    return this.$dropzone.get(0);
  };

  /**
   * Appends the droppable to the provided container.
   *
   * @param {jQuery} $container Container which the dropzone will be appended to.
   */
  Droppable.prototype.appendDroppableTo = function ($container) {
    this.$dropzoneContainer.appendTo($container);
  };
  /**
   * Appends the draggable contained within this dropzone to the argument.
   * Returns the Draggable that was reverted, if any exists
   *
   * @param {jQuery} $container Container which the draggable will append to.
   *
   * @return {Draggable}
   */
  Droppable.prototype.appendInsideDroppableTo = function ($container) {
    if (this.containedDraggable !== null) {
      this.containedDraggable.revertDraggableTo($container);
      return this.containedDraggable;
    }
  };

  /**
   * Sets the contained draggable in this drop box to the provided argument.
   *
   * @param {Draggable} droppedDraggable A draggable that has been dropped on this box.
   */
  Droppable.prototype.setDraggable = function (droppedDraggable) {
    const self = this;
    if (self.containedDraggable === droppedDraggable) {
      return;
    }
    if (self.containedDraggable !== null) {
      self.containedDraggable.removeFromZone();
    }
    self.containedDraggable = droppedDraggable;
    droppedDraggable.addToZone(self);
  };

  /**
   * Returns true if this dropzone currently has a draggable
   *
   * @return {boolean}
   */
  Droppable.prototype.hasDraggable = function () {
    return !!this.containedDraggable;
  };

  /**
   * Removes the contained draggable in this box.
   */
  Droppable.prototype.removeDraggable = function () {
    if (this.containedDraggable !== null) {
      this.containedDraggable = null;
      this.showRemovableBlock();
    }
  };

  /**
   * Checks if this drop box contains the correct draggable.
   *
   * @returns {Boolean} True if this box has the correct answer.
   */
  Droppable.prototype.isCorrect = function () {
    if (this.containedDraggable === null) {
      return false;
    }
    return this.text.includes(this.containedDraggable.getAnswerText());
  };

  /**
   * Sets CSS styling feedback for this drop box.
   */
  Droppable.prototype.addFeedback = function () {
    const self = this;

    //Draggable is correct
    // Option for displaying transparentBackground
    let background = '';
    if (this.params.behaviour.transparentBackground) {
      background = TRANSPARENT;
    }
    if (this.isCorrect()) {
        if (self.$tip) {
          if (this.params.behaviour.hideTips) {
            self.$tip.attr('style', 'display: none;');
            self.$dropzoneContainer.removeClass('has-tip');
          } else {
            this.$dropzone.attr('style', 'padding-right: 0.6em;');
          }
        }
        this.$dropzone.removeClass(WRONG_FEEDBACK).addClass(CORRECT_FEEDBACK + background);

      //Draggable feedback
      this.containedDraggable.getDraggableElement().removeClass(DRAGGABLE_FEEDBACK_WRONG).addClass(DRAGGABLE_FEEDBACK_CORRECT);
    }
    else if (this.containedDraggable === null) {
      //Does not contain a draggable
      this.$dropzone.removeClass(WRONG_FEEDBACK).removeClass(CORRECT_FEEDBACK);
    }
    else {
      //Draggable is wrong
        if (self.$tip) {
             if (background === TRANSPARENT) {
              this.$dropzone.attr('style', 'margin-right: 0em;');
          }
          else {
              this.$dropzone.attr('style', 'margin-right: 0.6em;');
          }
        }
      this.$dropzone.removeClass(CORRECT_FEEDBACK).addClass(WRONG_FEEDBACK + background);

      //Draggable feedback
      if (this.containedDraggable !== null) {
        this.containedDraggable.getDraggableElement().addClass(DRAGGABLE_FEEDBACK_WRONG).removeClass(DRAGGABLE_FEEDBACK_CORRECT);
      }
    }
  };

  /**
   * Removes all CSS styling feedback for this drop  *  * box.
   */
  Droppable.prototype.removeFeedback = function () {
    // Option for displaying transparentBackground
    let background = '';
    if (this.params.behaviour.transparentBackground) {
      background = TRANSPARENT;
    }
    this.$dropzone.removeClass(WRONG_FEEDBACK + background).removeClass(CORRECT_FEEDBACK  + background);

    //Draggable feedback
    if (this.containedDraggable !== null) {
      this.containedDraggable.getDraggableElement().removeClass(DRAGGABLE_FEEDBACK_WRONG).removeClass(DRAGGABLE_FEEDBACK_CORRECT);
    }
  };

  /**
   * Returns true if the dropzone has visible feedback
   */
  Droppable.prototype.hasFeedback = function () {
    return this.$dropzone.hasClass(WRONG_FEEDBACK) || this.$dropzone.hasClass(CORRECT_FEEDBACK);
  };

  /**
   * Returns true if the dropzone has visible correct feedback (if option Keep Answers)
   */
  Droppable.prototype.hasCorrectFeedback = function () {
    return this.$dropzone.hasClass(CORRECT_FEEDBACK) || this.$dropzone.hasClass(CORRECT_FEEDBACK)
       || this.$dropzone.hasClass(CORRECT_FEEDBACK + TRANSPARENT);
  };


  /**
   * Sets short format of draggable when inside a dropbox.
   */
  Droppable.prototype.setShortFormat = function () {
    if (this.containedDraggable !== null) {
      this.containedDraggable.setShortFormat();
    }
  };

  /**
   * Disables dropzone and the contained draggable.
   */

  Droppable.prototype.disableDropzoneAndContainedDraggable = function () {
    if (this.containedDraggable !== null) {
      this.containedDraggable.disableDraggable();
    }
    this.$dropzone.droppable({ disabled: true});
    this.$dropzone.droppable({ 'aria-disabled': true});
  };

  /**
   * Enable dropzone.
   */
  Droppable.prototype.enableDropzone = function () {
    this.$dropzone.droppable({ disabled: false});
    
  /**
   * Disable dropzone.
   */
  Droppable.prototype.disableDropzone = function () {
    this.$dropzone.droppable({ disabled: true });
  };


  };

  /**
   * Removes the short format of draggable when it is outside a dropbox.
   */
  Droppable.prototype.removeShortFormat = function () {
    if (this.containedDraggable !== null) {
      this.containedDraggable.removeShortFormat();
    }
  };

  /**
   * Gets this object's dropzone jQuery object.
   *
   * @returns {jQuery} This object's dropzone.
   */
  Droppable.prototype.getDropzone = function () {
    return this.$dropzone;
  };

  /**
   * Return the unique index of the dropzone
   *
   * @returns {number}
   */
  Droppable.prototype.getIndex = function () {
    return this.index;
  };

  /**
   * Return the unique index of the dropzone
   *
   * @returns {number}
   */
  Droppable.prototype.displayTip = function () {
    const self = this;
    if (self.tip) {
      self.$tip.attr('style', 'display: initial;');
    }
  };

  /**
   * Hides removableBlock when draggable element is dropped on dropzone
   */
  Droppable.prototype.hideRemovableBlock = function () {
    if (this.$removableBlock) {
      this.$removableBlock.addClass('hide');
    }
  };

  /**
   * Displays removableBlock to reset things for a Retry session.
   */
  Droppable.prototype.showRemovableBlock = function () {
    if (this.$removableBlock) {
      this.$removableBlock.removeClass('hide');
    }
  };

  return Droppable;
})(H5P.jQuery);

export default H5P.TextDroppable;
