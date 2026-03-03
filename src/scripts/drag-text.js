import { parseText, lex } from './parse-text';
import StopWatch from './stop-watch';
import Util from './util';
import Draggable from './draggable';
import Droppable from './droppable';

import Controls from 'h5p-lib-controls/src/scripts/controls';
import AriaDrag from 'h5p-lib-controls/src/scripts/aria/drag';
import AriaDrop from 'h5p-lib-controls/src/scripts/aria/drop';
import UIKeyboard from 'h5p-lib-controls/src/scripts/ui/keyboard';
import Mouse from 'h5p-lib-controls/src/scripts/ui/mouse';

/**
 * @typedef {object} H5P.DragTextEvent
 * @property {HTMLElement} element The element being dragged
 * @property {HTMLElement} [target] The target element
 */
/**
 * Drag event
 * @event H5P.DragTextpapijo#drag
 * @type {H5P.DragTextEvent}
 */
/**
 * Drop event
 * @event H5P.DragTextpapijo#drop
 * @type {H5P.DragTextEvent}
 */
/**
 * Revert event
 * @event H5P.DragTextpapijo#revert
 * @type {H5P.DragTextEvent}
 */
/**
 * Start event
 * @event H5P.DragTextpapijo#start
 * @type {H5P.DragTextEvent}
 */
/**
 * Stop event
 * @event H5P.DragTextpapijo#stop
 * @type {H5P.DragTextEvent}
 */
/**
 * Drag Text module
 * @external {jQuery} $ H5P.jQuery
 */
H5P.DragTextpapijo = (function ($, Question, ConfirmationDialog) {
  //CSS Main Containers:
  const INNER_CONTAINER = "h5p-drag-inner";
  const TASK_CONTAINER = "h5p-drag-task";
  const WORDS_CONTAINER = "h5p-drag-droppable-words";
  const DROPZONE_CONTAINER = "h5p-drag-dropzone-container";
  const DRAGGABLES_CONTAINER = "h5p-drag-draggables-container";

  //Special Sub-containers:
  const DRAGGABLES_WIDE_SCREEN = 'h5p-drag-wide-screen';
  const DRAGGABLE_ELEMENT_WIDE_SCREEN = 'h5p-drag-draggable-wide-screen';

  /**
   * Initialize module.
   *
   * @class H5P.DragTextpapijo
   * @extends H5P.Question
   * @param {Object} params Behavior settings
   * @param {Number} contentId Content identification
   * @param {Object} contentData Object containing task specific content data
   *
   * @returns {Object} DragTextpapijo Drag Text instance
   */
  function DragTextpapijo(params, contentId, contentData) {
    this.$ = $(this);
    this.contentId = contentId;
    this.contentData = contentData;
    Question.call(this, 'drag-text', { theme: true });

    // Set default behavior.
    this.params = $.extend(true, {
      media: {},
      taskDescription: "Set in adjectives in the following sentence",
      textField: "This is a *nice*, *flexible* content type, which allows you to highlight all the *wonderful* words in this *exciting* sentence.\n" +
        "This is another line of *fantastic* text.",
      distractors: "",
      overallFeedback: [],
      checkAnswer: "Check",
      submitAnswer: "Submit",
      tryAgain: "Retry",
      behaviour: {
        enableRetry: true,
        enableSolutionsButton: true,
        showSolutionsRequiresInput: true,
        enableCheckButton: true,
        instantFeedback: false,
        shortDropZones: false,
        hideTips: true,
        alphaSort: false,
        keepCorrectAnswers: false,
        transparentBackground: false,
        noWideScreenLayout: false,
        leftColumnWidth: 'auto',
        removeExtraLineBreaks: true
      },
      showSolution : "Show solution",
      dropZoneIndex: "Drop Zone @index.",
      empty: "Empty.",
      contains: "Drop Zone @index contains draggable @draggable.",
      ariaDraggableIndex: "@index of @count.",
      tipLabel: "Show tip",
      correctText: "Correct!",
      incorrectText: "Incorrect!",
      resetDropTitle: "Reset drop",
      resetDropDescription: "Are you sure you want to reset this drop zone?",
      grabbed: "Draggable is grabbed.",
      cancelledDragging: "Cancelled dragging.",
      correctAnswer: "Correct answer:",
      scoreBarLabel: 'You got :num out of :total points',
      a11yCheck: 'Check the answers. The responses will be marked as correct, incorrect, or unanswered.',
      a11yShowSolution: 'Show the solution. The task will be marked with its correct solution.',
      a11yRetry: 'Retry the task. Reset all responses and start the task over again.',
    }, params);

    this.contentData = contentData;
    if (this.contentData !== undefined && this.contentData.previousState !== undefined && this.contentData.previousState.length !== undefined) {
      this.previousState = this.contentData.previousState;
    }

    // Keeps track of if Question has been answered
    this.answered = false;

    // Convert line breaks to HTML
    this.textFieldHtml = this.params.textField.replace(/(\r\n|\n|\r)/gm, "<br/>");
    this.distractorsHtml = this.params.distractors.replace(/(\r\n|\n|\r)/gm, "<br/>");

    // introduction field id
    this.introductionId = 'h5p-drag-text-' + contentId + '-introduction';
    this.shortDropZones = this.params.behaviour.shortDropZones;
    /**
     * @type {HTMLElement} selectedElement
     */
    this.selectedElement = undefined;

    // Init keyboard navigation
    this.ariaDragControls = new AriaDrag();
    this.ariaDropControls = new AriaDrop();
    this.dragControls = new Controls([new UIKeyboard(), new Mouse(), this.ariaDragControls]);
    this.dragControls.useNegativeTabIndex();
    this.dropControls = new Controls([new UIKeyboard(), new Mouse(), this.ariaDropControls]);
    this.dropControls.useNegativeTabIndex();

    // return false to prevent select from happening when draggable is disabled
    this.dragControls.on('before-select', event => !this.isElementDisabled(event.element));

    this.dragControls.on('select', this.keyboardDraggableSelected, this);
    this.dropControls.on('select', this.keyboardDroppableSelected, this);

    // add and remove droppables on start/stop drag from controls
    this.on('start', this.addAllDroppablesToControls, this);
    this.on('revert', this.removeControlsFromEmptyDropZones, this);
    this.on('stop', event => {
      if(!event.data.target) {
        this.removeControlsFromDropZonesIfAllEmpty();
      }
    }, this);
    this.on('drop', this.removeControlsFromEmptyDropZones, this);

    // toggle label for draggable
    this.on('start', event => {
      const element = event.data.element;
      const draggable = this.getDraggableByElement(element);

      // on drag and drop, toggle aria-dropeffect between 'move', and 'none'
      this.toggleDropEffect();
      element.setAttribute('aria-grabbed', 'true')
      this.setDraggableAriaLabel(draggable);
    });

    this.on('stop', event => {
      const element = event.data.element;
      const draggable = this.getDraggableByElement(element);

      // on drag and drop, toggle aria-dropeffect between 'move', and 'none'
      this.toggleDropEffect();
      element.setAttribute('aria-grabbed', 'false')
      this.setDraggableAriaLabel(draggable);
    });

    // on drop, remove all dragging
    this.on('drop', this.ariaDropControls.setAllToNone, this.ariaDropControls);

    // on drop remove element from drag controls
    this.on('drop', function(event) {
      this.dragControls.removeElement(event.data.element);
    }, this);

    // on revert, re add element to drag controls
    this.on('revert', function(event) {
      this.dragControls.insertElementAt(event.data.element, 0);
    }, this);

    this.on('drop', this.updateDroppableElement, this);
    this.on('revert', this.updateDroppableElement, this);

    // Init drag text task
    this.initDragText();

    // Start stop watch
    this.stopWatch = new StopWatch();
    this.stopWatch.start();

    this.on('resize', this.resize, this);

    // toggle the draggable container
    this.toggleDraggablesContainer();
    this.on('revert', this.toggleDraggablesContainer, this);
    this.on('drop', this.toggleDraggablesContainer, this);

    // Indicate operations trough read speaker
    this.on('stop', event => {
      if(!event.data.target) {
        this.read(this.params.cancelledDragging);
      }
    });

    // trigger instant feedback
    if (this.params.behaviour.instantFeedback) {
      this.on('revert', () => this.instantFeedbackEvaluation());
    }
  }

  DragTextpapijo.prototype = Object.create(Question.prototype);
  DragTextpapijo.prototype.constructor = DragTextpapijo;

  /**
   * Updates the state of a droppable element
   *
   * @param event
   */
  DragTextpapijo.prototype.updateDroppableElement = function(event) {
    const dropZone = event.data.target;
    const draggable = event.data.element;
    const droppable = this.getDroppableByElement(dropZone);

    if (dropZone) {
      this.setDroppableLabel(dropZone, draggable.textContent, droppable.getIndex());
    }
  };

  /**
   * Remove controls from dropzones if all is empty
   */
  DragTextpapijo.prototype.removeControlsFromDropZonesIfAllEmpty = function() {
    if (!this.anyDropZoneHasDraggable()) {
      this.removeAllDroppablesFromControls();
    }
  };

  /**
   * Remove controls from dropzones without draggables
   */
  DragTextpapijo.prototype.removeControlsFromEmptyDropZones = function() {
    this.droppables
      .filter(droppable => !droppable.hasDraggable())
      .map(droppable => droppable.getElement())
      .forEach(el => {
        this.dropControls.removeElement(el);
      });
  };

  /**
   * Add all drop zones to drop keyboard controls
   */
  DragTextpapijo.prototype.addAllDroppablesToControls = function() {
    // to have a clean start, remove all first
    if(this.dropControls.count() > 0){
      this.removeAllDroppablesFromControls();
    }

    // add droppables in correct order
    this.droppables
      .map(droppable => droppable.getElement())
      .forEach(el => this.dropControls.addElement(el));
  };

  /**
   * Remove all drop zones from drop keyboard controls
   */
  DragTextpapijo.prototype.removeAllDroppablesFromControls = function() {
    this.droppables
      .map(droppable => droppable.getElement())
      .forEach(el => this.dropControls.removeElement(el));
  };

  /**
   * Remove all drop zones from drop keyboard controls
   */
  DragTextpapijo.prototype.anyDropZoneHasDraggable = function() {
    return this.droppables.some(droppable => droppable.hasDraggable());
  };

  /**
   * Sets the aria-label of a dropzone based on whether it has a droppable inside it
   *
   * @param {HTMLElement} dropZone
   * @param {string} text
   * @param {number} index
   */
  DragTextpapijo.prototype.setDroppableLabel = function(dropZone, text, index) {
    const indexText = this.params.dropZoneIndex.replace('@index', index.toString());
    const correctFeedback = dropZone.classList.contains('h5p-drag-correct-feedback');
    const inCorrectFeedback = dropZone.classList.contains('h5p-drag-wrong-feedback');
    const checkButtonPressed = correctFeedback || inCorrectFeedback;
    const hasChildren = (dropZone.childNodes.length > 0);

    if (dropZone) {
      let ariaLabel;

      if (checkButtonPressed) {
        const droppable = this.getDroppableByElement(dropZone);
        let resultString = '';
        if (correctFeedback) {
          resultString = droppable.correctFeedback ? droppable.correctFeedback : this.params.correctText;
        }
        else {
          resultString = droppable.incorrectFeedback ? droppable.incorrectFeedback : this.params.incorrectText;
        }
        ariaLabel = `${this.params.contains.replace('@index', index.toString()).replace('@draggable', text)} ${resultString}.`;

        if (droppable && droppable.containedDraggable) {
          droppable.containedDraggable.updateAriaDescription(
            correctFeedback ? this.params.correctText : this.params.incorrectText
          );
        }
        
      }
      else if (hasChildren) {
        ariaLabel = `${this.params.contains.replace('@index', index.toString()).replace('@draggable', text)}`;
      }
      else {
        ariaLabel = `${this.params.empty.replace('@index', index.toString())}`;
      }

      dropZone.setAttribute('aria-label', ariaLabel);      
    }
  };

  /**
   * Registers this question type's DOM elements before they are attached.
   * Called from H5P.Question.
   */
  DragTextpapijo.prototype.registerDomElements = function () {
    // Register optional media
    let media = this.params.media;
    if (media && media.type && media.type.library) {
      media = media.type;
      const type = media.library.split(' ')[0];
      if (type === 'H5P.Image') {
        if (media.params.file) {
          // Register task image
          this.setImage(media.params.file.path, {
            disableImageZooming: this.params.media.disableImageZooming || false,
            alt: media.params.alt,
            title: media.params.title,
            expandImage: media.params.expandImage,
            minimizeImage: media.params.minimizeImage
          });
        }
      }
      else if (type === 'H5P.Video') {
        if (media.params.sources) {
          // Register task video
          this.setVideo(media);
        }
      }
      else if (type === 'H5P.Audio') {
        if (media.params.files) {
          // Register task audio
          this.setAudio(media);
        }
      }
    }

    // Register task introduction text
    this.$introduction = $('<p id="' + this.introductionId + '">' + this.params.taskDescription + '</p>');
    this.setIntroduction(this.$introduction);
    this.$introduction.parent().attr('tabindex', '-1');

    // Register task content area
    this.setContent(this.$inner);

    // Register buttons
    this.addButtons();
  };

  /**
   * Initialize drag text task
   */
  DragTextpapijo.prototype.initDragText = function () {
    this.$inner = $('<div/>', {
      'aria-describedby': this.introductionId,
      'class': INNER_CONTAINER
    });

    // Create task
    this.addTaskTo(this.$inner);

    // Set stored user state
    this.setH5PUserState();

    return this.$inner;
  };

  /**
   * Changes layout responsively when resized.
   */
  DragTextpapijo.prototype.resize = function () {
    this.changeLayoutToFitWidth();
  };

  /**
  * Adds the draggables on the right side of the screen if widescreen is detected.
  */
  /*
  DragTextpapijo.prototype.changeLayoutToFitWidth = function () {
    var self = this;
    self.addDropzoneWidth();

    //Find ratio of width to em, and make sure it is less than the predefined ratio, make sure widest draggable is less than a third of parent width.
    if ((self.$inner.width() / parseFloat(self.$inner.css("font-size"), 10) > 43) && (self.widestDraggable <= (self.$inner.width() / 3))) {
      self.$taskContainer.addClass(DRAGGABLES_WIDE_SCREEN);
    } else {
      self.$taskContainer.removeClass(DRAGGABLES_WIDE_SCREEN);
    }
  };
*/
DragTextpapijo.prototype.changeLayoutToFitWidth = function () {
    const self = this;
    self.addDropzoneWidth();
    
    if (!self.params.behaviour.noWideScreenLayout && (self.$inner.width() / parseFloat(self.$inner.css("font-size"), 10) > 23)) {
        self.$draggables.detach().appendTo(self.$taskContainer);
        self.$wordContainer.addClass(DRAGGABLES_WIDE_SCREEN);
        let usedPercentStr = self.params.behaviour.leftColumnWidth;
        let usedPercent = parseFloat(usedPercentStr);
        let remainingPercent = 100 - usedPercent + "%";
        self.$wordContainer.css({'width': self.params.behaviour.leftColumnWidth});
        self.$draggables.css({'width': remainingPercent});
    }
    else {
      // Remove the specific wide screen settings.
      self.$wordContainer.css({'margin-right': 0});
      self.$draggables.removeClass(DRAGGABLES_WIDE_SCREEN);
      self.$draggables.detach().appendTo(self.$taskContainer);
      self.draggables.forEach(function (draggable) {
        draggable.getDraggableElement().removeClass(DRAGGABLE_ELEMENT_WIDE_SCREEN);
      });
    }
  };

  /**
   * Add check solution, show solution and retry buttons, and their functionality.
   */
  DragTextpapijo.prototype.addButtons = function () {
    var self = this;

    if (self.params.behaviour.enableCheckButton) {
      // Checking answer button
      self.addButton('check-answer', self.params.checkAnswer, function () {
        self.answered = true;
        self.removeAllElementsFromDragControl();

        if (!self.showEvaluation()) {
          if (self.params.behaviour.enableRetry) {
            self.showButton('try-again');
          }
          if (self.params.behaviour.enableSolutionsButton) {
            self.showButton('show-solution');
          }
          self.hideButton('check-answer');
          self.disableDraggables();
        } else {
          self.hideButton('show-solution');
          self.hideButton('try-again');
          self.hideButton('check-answer');
        }

        // Focus top of the task for natural navigation
        self.$introduction.parent().focus();
      }, !self.params.behaviour.instantFeedback, {
        'aria-label': self.params.a11yCheck,
      }, {
        icon: 'check',
        contentData: self.contentData,
        textIfSubmitting: self.params.submitAnswer,
      });
    }

    //Show Solution button
    self.addButton('show-solution', self.params.showSolution, function () {
      self.droppables.forEach(function (droppable) {
        droppable.showSolution();
      });
      self.draggables.forEach(draggable => self.setDraggableAriaLabel(draggable));
      self.disableDraggables();
      self.removeAllDroppablesFromControls();
      self.hideButton('show-solution');
    }, self.initShowShowSolutionButton || false, {
      'aria-label': self.params.a11yShowSolution,
    },
    {
      styleType: 'secondary',
      icon: 'show-results',
    });
/*
    //Retry button
    self.addButton('try-again', self.params.tryAgain, function () {
      self.resetTask();
      self.read(self.params.taskDescription);
    }, self.initShowTryAgainButton || false, {
      'aria-label': self.params.a11yRetry,
    },
    {
      styleType: 'secondary',
      icon: 'retry',
    });
  */
  //Retry button
    self.addButton('try-again', self.params.tryAgain, function () {
      // Reset and shuffle draggables if Question is answered
      if (self.answered) {
        // move draggables to original container
        self.resetDraggables();
      }

      self.answered = false;
      self.hideEvaluation();
      self.hideExplanation();
      self.hideButton('try-again');
      self.hideButton('show-solution');
      if (self.params.behaviour.instantFeedback) {
        self.enableAllDropzonesAndDraggables();
      }
      else {
        self.showButton('check-answer');
        self.enableDraggables();
        self.droppables.forEach(function (droppable) {
          if (droppable.hasCorrectFeedback()) {
            droppable.disableDropzoneAndContainedDraggable();
          }
          else {
           /// todo droppable.displayTip();
          }
        });
      }
      self.droppables.forEach(function (droppable) {
        if (droppable.removableBlock && !droppable.hasCorrectFeedback()) {
          droppable.showRemovableBlock();
        }
      });
      self.hideAllSolutions();

      self.stopWatch.reset();
      self.read(self.params.taskDescription);
    }, self.initShowTryAgainButton || false, {
      'aria-label': self.params.a11yRetry,
    });
  };

  /**
   * Removes keyboard support for all elements left in the draggables
   * list.
   */
  DragTextpapijo.prototype.removeAllElementsFromDragControl = function () {
    this.dragControls.elements.forEach(element => this.dragControls.removeElement(element));
  };

  /**
   * Handle selected draggable
   *
   * @param {ControlsEvent} event
   *
   * @fires H5P.DragTextpapijo#start
   */
  DragTextpapijo.prototype.keyboardDraggableSelected = function (event) {
    var tmp = this.selectedElement;
    var hasSelectedElement = this.selectedElement !== undefined;
    var isSelectedElement = this.selectedElement ===  event.element;

    // unselect the selected
    if(hasSelectedElement) {
      this.selectedElement = undefined;
      this.trigger('stop', { element: tmp });
    }

    // no previous selected or not the selected one
    if((!hasSelectedElement || !isSelectedElement) && !this.isElementDisabled(event.element)) {
      this.selectedElement = event.element;
      this.trigger('start', { element: event.element });
      this.focusOnFirstEmptyDropZone();
    }
  };

  /**
   * Focuses on the first empty drop zone
   */
  DragTextpapijo.prototype.focusOnFirstEmptyDropZone = function() {
    const dropZone = this.droppables
      .filter(droppable => !droppable.hasDraggable())[0];
    const element = dropZone.getElement();

    this.dropControls.setTabbable(element);
    element.focus();
  };

  /**
   * Returns true if aria-disabled="true" on the element
   *
   * @param {HTMLElement} element
   *
   * @return {boolean}
   */
  DragTextpapijo.prototype.isElementDisabled = function (element) {
    return element.getAttribute('aria-disabled') === 'true';
  };

  /**
   * Handle selected droppable
   *
   * @param {ControlsEvent} event
   */
  DragTextpapijo.prototype.keyboardDroppableSelected = function (event) {
    var self = this;

    var droppableElement = event.element;
    var droppable = self.getDroppableByElement(droppableElement);
    var draggable = self.getDraggableByElement(this.selectedElement);

    var isCorrectInstantFeedback = this.params.behaviour.instantFeedback && droppable && droppable.isCorrect();
    var isShowingFeedback = !this.params.behaviour.instantFeedback && droppable.hasFeedback();

    // if something selected
    if(draggable && droppable && !isCorrectInstantFeedback) {
      var tmp = self.selectedElement;
      // initiate drop
      self.drop(draggable, droppable);

      self.selectedElement = undefined;

      // update selected
      this.trigger('stop', {
        element: tmp,
        target: droppable.getElement()
      });
    }
    else if(droppable && droppable.hasDraggable() && !isShowingFeedback && !isCorrectInstantFeedback) {
      var containsDropped = droppableElement.querySelector('[aria-grabbed]');

      this.createConfirmResetDialog(function () {
        self.revert(self.getDraggableByElement(containsDropped));
      }).show();
    }
  };

  /**
   * Initialize drag text task
   */
  DragTextpapijo.prototype.toggleDraggablesContainer = function () {
    var isEmpty = this.$draggables.children().length === 0;
    this.$draggables.toggleClass('hide', isEmpty);
  };

  /**
   * Opens a confirm dialog, where the user has to confirm that they want to reset a droppable
   *
   * @param {function} callback
   * @param {object} [scope]
   *
   * @returns {ConfirmationDialog}
   */
  DragTextpapijo.prototype.createConfirmResetDialog = function (callback, scope) {
    var self = this;
    var dialog = new ConfirmationDialog({
      headerText: self.params.resetDropTitle,
      dialogText: self.params.resetDropDescription,
      theme: true
    });

    dialog.appendTo(self.$inner.closest('.h5p-drag-text').get(0));
    dialog.on('confirmed', callback, scope || this);

    return dialog;
  };

  /**
   * Shows feedback for dropzones.
   */
  DragTextpapijo.prototype.showDropzoneFeedback = function () {
    this.droppables.forEach(droppable => {
      droppable.addFeedback();
      const draggable = droppable.containedDraggable;

      if (droppable && draggable) {
        this.setDroppableLabel(droppable.getElement(), draggable.getElement().textContent, droppable.getIndex());
        this.setDraggableAriaLabel(draggable);
      }
    });
  };

  /**
   * Generates data that is used to render the explanation container
   * at the bottom of the content type
   */
  DragTextpapijo.prototype.showExplanation = function () {
    const self = this;
    let explanations = [];

    this.droppables.forEach(droppable => {
      const draggable = droppable.containedDraggable;

      if (droppable && draggable) {
        if (droppable.isCorrect() && droppable.correctFeedback) {
          explanations.push({
            correct: draggable.text,
            text: droppable.correctFeedback
          });
        }

        if (!droppable.isCorrect() && droppable.incorrectFeedback) {
          explanations.push({
            correct: droppable.text,
            wrong: draggable.text,
            text: droppable.incorrectFeedback
          });
        }
      }
    });

    if (explanations.length !== 0) {
      this.setExplanation(explanations, self.params.feedbackHeader);
    }
  };

  /**
   * Evaluate task and display score text for word markings.
   *
   * @param {boolean} [skipXapi] Skip sending xAPI event answered
   *
   * @returns {Boolean} Returns true if maxScore was achieved.
   */
  DragTextpapijo.prototype.showEvaluation = function (skipXapi) {
    this.hideEvaluation();
    this.showDropzoneFeedback();
    this.showExplanation();

    var score = this.calculateScore();
    var maxScore = this.droppables.length;

    if (!skipXapi) {
      var xAPIEvent = this.createXAPIEventTemplate('answered');
      this.addQuestionToXAPI(xAPIEvent);
      this.addResponseToXAPI(xAPIEvent);
      this.trigger(xAPIEvent);
    }

    var scoreText = H5P.Question.determineOverallFeedback(this.params.overallFeedback, score / maxScore)
      .replace(/@score/g, score.toString())
      .replace(/@total/g, maxScore.toString());

    if (score === maxScore) {
      //Hide buttons and disable task
      this.hideButton('check-answer');
      this.hideButton('show-solution');
      this.hideButton('try-again');
      this.disableDraggables();
    }
    this.trigger('resize');

    // Set feedback score
    this.setFeedback(scoreText, score, maxScore, this.params.scoreBarLabel);

    return score === maxScore;
  };

  /**
   * Returns the number of correct entries
   *
   * @returns {number}
   */
  DragTextpapijo.prototype.calculateScore = function () {
    return this.droppables.reduce(function (sum, entry) {
      return sum + (entry.isCorrect() ? 1 : 0);
    }, 0);
  };

  /**
   * Clear the evaluation text.
   */
  DragTextpapijo.prototype.hideEvaluation = function () {
    this.removeFeedback();
    this.trigger('resize');
  };

  /**
   * Remove the explanation container
   */
  DragTextpapijo.prototype.hideExplanation = function () {
    this.setExplanation();
    this.trigger('resize');
  };

  /**
   * Hides solution text for all dropzones.
   */
  DragTextpapijo.prototype.hideAllSolutions = function () {
    this.droppables.forEach(function (droppable) {
      droppable.hideSolution();
    });
    this.trigger('resize');
  };

  /**
   * Handle task and add it to container.
   *
   * @param {jQuery} $container The object which our task will attach to.
   */
  DragTextpapijo.prototype.addTaskTo = function ($container) {
    var self = this;
    self.widest = 0;
    ///self.widestDraggable = 0;
    self.droppables = [];
    self.draggables = [];

    self.$taskContainer = $('<div/>', {
      'class': TASK_CONTAINER
    });

    self.$draggables = $('<div/>', {
      'class': DRAGGABLES_CONTAINER
    });

    self.$wordContainer = $('<div/>', {'class': WORDS_CONTAINER + ' h5p-theme-lines'});
/*
       * Temporarily replace escaped asterisks & colons with a replacement character,
       * so they don't tamper with the detection of words/phrases to be dragged
       */
    const ESCAPED_ASTERISK_REPLACEMENT = '\u250C'; // BOX DRAWINGS LIGHT DOWN AND RIGHT unicode character
    const ESCAPED_COLON_REPLACEMENT = '\u250D'; //BOX DRAWINGS DOWN LIGHT AND RIGHT HEAVY unicode character
    const ASTERISK = '*';
    const COLON = ':';
    const DUMMYCHARACTER = '\u200B'; // zero-width space character
    self.textFieldHtml = self.textFieldHtml.replaceAll('\\*', ESCAPED_ASTERISK_REPLACEMENT)
      .replaceAll('\\:', ESCAPED_COLON_REPLACEMENT);
    // parse text
   parseText(self.textFieldHtml)
      .forEach(function (part) {
        if (self.isAnswerPart(part)) {
          // is draggable/droppable
          const solution = lex(part);
          solution.text = solution.text.replaceAll(ESCAPED_ASTERISK_REPLACEMENT, ASTERISK)
            .replaceAll(ESCAPED_COLON_REPLACEMENT, COLON);
          // Deal with potential escaped asterisks & escaped colons within tip.
          if (solution.tip) {
            // If tip contains image and no text, add an invisible space to make blur happy.
            solution.tip = DUMMYCHARACTER + solution.tip.replaceAll(ESCAPED_ASTERISK_REPLACEMENT, ASTERISK)
              .replaceAll(ESCAPED_COLON_REPLACEMENT, COLON);
          }
          if (solution.correctFeedback) {
            solution.correctFeedback = solution.correctFeedback.replaceAll(ESCAPED_ASTERISK_REPLACEMENT, ASTERISK)
              .replaceAll(ESCAPED_COLON_REPLACEMENT, COLON);
          }
          if (solution.incorrectFeedback) {
            solution.incorrectFeedback = solution.incorrectFeedback.replaceAll(ESCAPED_ASTERISK_REPLACEMENT, ASTERISK)
              .replaceAll(ESCAPED_COLON_REPLACEMENT, COLON);
          }
          // Accept multiple correct answers inside pairs of asterisks.
          // Split by slash _not preceded by the < character_ in case some solution.text is formatted with html tags.
          const solutions = solution.text.split(/(?<![<\\])\//);
          solutions.forEach((solution, index) => {
            solutions[index] = solution.replace(/\\\//g, "/");
            self.createDraggable(solutions[index]);
          });
          self.createDroppable(solutions, solution.tip, solution.correctFeedback, solution.incorrectFeedback, solution.removableBlock);
        }
        else {
          // is normal text
          const el = Util.createElementWithTextPart(part);
          self.$wordContainer.append(el);
        }
      });

    // Add distractors
    parseText(self.distractorsHtml).forEach(function (distractor) {
      if (distractor.trim() === '') {
        return; // Skip
      }
      distractor = lex(distractor);
      // Accept multiple distractors inside a pair of asterisks.
      const distractors = distractor.text.split(/(?<!<)\//);
      distractors.forEach ((distractor) => {
        self.createDraggable(distractor);
      });
    } );

    self.shuffleAndAddDraggables(self.$draggables);
    
    // We need to reverse the alphaSort order just once.
    if (this.params.behaviour.alphaSort) {
      self.draggables.reverse();
    }

    $('<div>', { class: 'h5p-drag-droppable-words-container' })
      .append(self.$wordContainer)
      .appendTo(self.$taskContainer);
    self.$draggables.appendTo(self.$taskContainer);
    self.$taskContainer.appendTo($container);
    self.addDropzoneWidth();
  };

  /**
   * Returns true if part starts and ends with an asterisk
   *
   * @param {string} part
   *
   * @returns {boolean}
   */
  DragTextpapijo.prototype.isAnswerPart = function(part) {
    return Util.startsWith('*', part) && Util.endsWith('*', part);
  };

  /**
   * Matches the width of all dropzones to the widest draggable, and sets widest class variable.
   */
   /*
  DragTextpapijo.prototype.addDropzoneWidth = function () {
    var self = this;
    var widest = 0;
    var widestDragagble = 0;
    var fontSize = parseInt(this.$inner.css('font-size'), 10);
    var staticMinimumWidth = 3 * fontSize;

    //Find widest draggable
    this.draggables.forEach(function (draggable) {
      var $draggableElement = draggable.getDraggableElement();

      //Find the initial natural width of the draggable.
      var $tmp = $draggableElement.clone().css({
        'position': 'absolute',
        'white-space': 'nowrap',
        'width': 'auto',
        'padding': 0,
        'margin': 0
      }).html(draggable.getAnswerText())
        .appendTo($draggableElement.parent());
      var width = $tmp.outerWidth();

      widestDragagble = width > widestDragagble ? width : widestDragagble;

      // Measure how big truncated draggable should be
      if ($tmp.text().length >= 20) {
        $tmp.html(draggable.getShortFormat());
        width = $tmp.width();
      }

      // Include the width of the handle if not there
      if ($draggableElement.hasClass('ui-draggable-disabled')) {
        width += 16;
      }

      if (width > widest) {
        widest = width;
      }
      $tmp.remove();
    });

    // Make room for feedback icons
    widest += 16;

    // Set min size
    if (widest < staticMinimumWidth) {
      widest = staticMinimumWidth;
    }
    this.widestDraggable = widestDragagble;
    this.widest = widest;
    //Adjust all droppable to widest size.
    this.droppables.forEach(function (droppable) {
      droppable.getDropzone().width(self.widest);
    });
  };
*/
/**
   * Sets dropzone width to either short 1em or default 8em
   */
  
  DragTextpapijo.prototype.addDropzoneWidth = function () {
    const width = this.shortDropZones ? '1em' : '8em';
    this.droppables.forEach(function (droppable) {
        droppable.getDropzone().width(width);
      });
    };
  /**
   * Makes a drag n drop from the specified text.
   *
   * @param {String} answer Text for the drag n drop.
   *
   * @returns {H5P.TextDraggable}
   */
  DragTextpapijo.prototype.createDraggable = function (answer) {
    var self = this;

    //Make the draggable
    var $draggable = $('<div/>', {
      html: `<span>${answer}</span>`,
      role: 'button',
      'aria-grabbed': 'false',
      tabindex: '-1'
    }).draggable({
      revert: function(isValidDrop) {
        if (!isValidDrop) {
          self.revert(draggable);
        }
        return false;
      },
      drag: self.propagateDragEvent('drag', self),
      start: self.propagateDragEvent('start', self),
      stop: function (event) {
        self.trigger('stop', {
          element: draggable.getElement(),
          target: event.target
        });
      },
      containment: self.$taskContainer
    }).append($('<span>', {
      'class': 'h5p-hidden-read'
    }));

    var draggable = new Draggable(answer, $draggable, self.draggables.length);
    draggable.on('addedToZone', function () {
      self.triggerXAPI('interacted');
    });

    self.draggables.push(draggable);

    return draggable;
  };

  /**
   * Get index of currently hovered droppable.
   * @returns {number} 0-based index of hovered droppable, or -1 if none is hovered.
   */
  DragTextpapijo.prototype.getHoveredDroppableIndex = function() {
    return this.hoveredDroppables.length > 0 ? this.hoveredDroppables[this.hoveredDroppables.length - 1] : -1;
  };

  /**
   * Creates a Droppable
   *
   * @param {string} answer
   * @param {string} [tip]
   *
   * @returns {H5P.TextDroppable}
   */
  DragTextpapijo.prototype.createDroppable = function (answer, tip, correctFeedback, incorrectFeedback) {
    var self = this;

    var draggableIndex = this.draggables.length;

    //Make the dropzone
    var $dropzoneContainer = $('<div/>', {
      'class': DROPZONE_CONTAINER
    });

    this.hoveredDroppables = [];

    var $dropzone = $('<div/>', {
      'aria-dropeffect': 'none',
      'aria-label':  this.params.dropZoneIndex.replace('@index', draggableIndex.toString()) + ' ' + this.params.empty.replace('@index', draggableIndex.toString()),
      'tabindex': '-1'
    }).appendTo($dropzoneContainer)
      .droppable({
        tolerance: 'touch',
        over: () => {
          this.hoveredDroppables.push(draggableIndex - 1);
          this.hoveredDroppables.sort((a, b) => b - a);

          const hoveredIndex = this.getHoveredDroppableIndex();
          self.droppables.forEach((droppable, index) => {
            droppable.toggleHovered(index === hoveredIndex);
          });
        },
        out: () => {
          this.hoveredDroppables = this.hoveredDroppables.filter(index => index !== draggableIndex - 1);
          const hoveredIndex = this.getHoveredDroppableIndex();

          self.droppables.forEach((droppable, index) => {
            droppable.toggleHovered(index === hoveredIndex);
          });
        },
        drop: function (event, ui) {
          const hoveredIndex = self.getHoveredDroppableIndex();
          if (hoveredIndex === -1) {
            return; // Should never happen
          }

          var draggable = self.getDraggableByElement(ui.draggable[0]);
          var droppable = droppable = self.droppables[hoveredIndex];

          // Reset hovered droppables
          self.hoveredDroppables = [];
          self.droppables.forEach(droppable => {
            droppable.toggleHovered(false);
          });

          /**
           * Note that drop will run for all initialized DragTextpapijo dropzones globally. Even other
           * DragTexts instances. Thus if no matching draggable or droppable is found
           * for this dropzone we must skip it.
           */
          if (!draggable || !droppable) {
            return;
          }
          self.drop(draggable, droppable);
        }
      });

    var droppable = new Droppable(answer, tip, correctFeedback, incorrectFeedback, $dropzone, $dropzoneContainer, draggableIndex, self.params);
    droppable.appendDroppableTo(self.$wordContainer);

    self.droppables.push(droppable);

    return droppable;
  };

  /**
   * Propagates a jQuery UI event
   *
   * @param {string} part
   * @param {string} object
   * @param {object} event
   *
   * @function
   * @returns {boolean}
   */
  DragTextpapijo.prototype.propagateDragEvent = Util.curry(function(eventName, self, event) {
    self.trigger(eventName, {
      element: event.target
    });
  });

  /**
   * Resets a draggable
   *
   * @param {H5P.TextDraggable} draggable
   *
   * @fires H5P.DragTextpapijo#revert
   * @fires Question#resize
   */
  DragTextpapijo.prototype.revert = function (draggable) {
    if (this.params.behaviour.keepCorrectAnswers && draggable.insideDropzone && draggable.hasCorrectFeedback() && !this.resetCorrectAnswers) {
      return;
    }
    var droppable = draggable.removeFromZone();
    var target = droppable ? droppable.getElement() : undefined;
    draggable.revertDraggableTo(this.$draggables);
    this.setDraggableAriaLabel(draggable);

    this.trigger('revert', { element: draggable.getElement(), target: target });
    this.trigger('resize');
  };

  /**
   * Handles dropping an element
   *
   * @param {H5P.TextDraggable} draggable
   * @param {H5P.TextDroppable} droppable
   *
   * @fires H5P.DragTextpapijo#revert
   * @fires H5P.DragTextpapijo#drop
   * @fires Question#resize
   */
  DragTextpapijo.prototype.drop = function (draggable, droppable) {
    var self = this;
    // Do not drop text on an existing correctly filled drop zone!
    if (this.params.behaviour.keepCorrectAnswers && droppable.hasCorrectFeedback()) {
      // TODO try to set previous dropZone to -1
      return;
    }
    self.answered = true;

    draggable.removeFromZone();

    // if already contains draggable
    var revertedDraggable = droppable.appendInsideDroppableTo(this.$draggables);

    // trigger revert, if revert was performed
    if(revertedDraggable){
      self.trigger('revert', {
        element: revertedDraggable.getElement(),
        target: droppable.getElement()
      });
    }
    else if (this.selectedElement === draggable.getElement()) {
      draggable.revertDraggableTo(droppable.$dropzoneContainer);
    }

    droppable.setDraggable(draggable);    
    draggable.appendDraggableTo(droppable.getDropzone());

    if (self.params.behaviour.instantFeedback) {
      droppable.addFeedback();
      self.instantFeedbackEvaluation();

      if (!self.params.behaviour.enableRetry || droppable.isCorrect()) {
        droppable.disableDropzoneAndContainedDraggable();
      }
    }

    this.trigger('drop', {
      element: draggable.getElement(),
      target: droppable.getElement()
    });
    
    this.trigger('resize');
    
    // Resize dropzone width to fit dropped droppagle.
    droppable.getDropzone().width('fit-content');  
    
  };

  /**
   * Adds the draggable words to the provided container in random order.
   *
   * @param {jQuery} $container Container the draggables will be added to.
   *
   * @returns {H5P.TextDraggable[]}
   */
  DragTextpapijo.prototype.shuffleAndAddDraggables = function ($container) {
    if (!this.params.behaviour.alphaSort) {
      return Util.shuffle(this.draggables)
        .map((draggable, index) => draggable.setIndex(index))
        .map(draggable => this.addDraggableToContainer($container, draggable))
        .map(draggable => this.setDraggableAriaLabel(draggable))
        .map(draggable => this.addDraggableToControls(this.dragControls, draggable));
    }
    else {
      return Util.alphasort(this.draggables)
        .map((draggable, index) => draggable.setIndex(index))
        .map(draggable => this.addDraggableToContainer($container, draggable))
        .map(draggable => this.setDraggableAriaLabel(draggable))
        .map(draggable => this.addDraggableToControls(this.dragControls, draggable));
    }
  };

  /**
   * Sets an aria label numbering the draggables
   *
   * @param {H5P.TextDraggable} draggable
   *
   * @return {H5P.TextDraggable}
   */
  DragTextpapijo.prototype.setDraggableAriaLabel = function (draggable) {
    draggable.updateAriaLabel(this.params.ariaDraggableIndex
      .replace('@index', (draggable.getIndex() + 1).toString())
      .replace('@count', this.draggables.length.toString()));

    return draggable;
  };

  /**
   * Returns true if aria-grabbed="true" on an element
   *
   * @param {HTMLElement} element
   * @returns {boolean}
   */
  DragTextpapijo.prototype.isGrabbed = function (element) {
    return element.getAttribute("aria-grabbed") === 'true';
  };

  /**
   * Adds the draggable to the container
   *
   * @param {jQuery} $container
   * @param {H5P.TextDraggable} draggable
   *
   * @returns {H5P.TextDraggable}
   */
  DragTextpapijo.prototype.addDraggableToContainer = function ($container, draggable) {
    draggable.appendDraggableTo($container);
    return draggable;
  };

  /**
   * Adds the element of Draggables to (keyboard) controls
   *
   * @param {H5P.Controls} controls
   * @param {H5P.TextDraggable} draggable
   *
   * @returns {H5P.TextDraggable}
   */
  DragTextpapijo.prototype.addDraggableToControls = function (controls, draggable) {
    controls.addElement(draggable.getElement());
    return draggable;
  };

  /**
   * Feedback function for checking if all fields are filled, and show evaluation if that is the case.
   */
  DragTextpapijo.prototype.instantFeedbackEvaluation = function () {
    var self = this;
    var allFilled = self.isAllAnswersFilled();

    if (allFilled) {
      //Shows "retry" and "show solution" buttons.
      if (self.params.behaviour.enableSolutionsButton) {
        self.showButton('show-solution');
      }
      if (self.params.behaviour.enableRetry) {
        self.showButton('try-again');
      }

      // Shows evaluation text
      self.showEvaluation();
    }
    else {
      //Hides "retry" and "show solution" buttons.
      self.hideButton('try-again');
      self.hideButton('show-solution');

      //Hides evaluation text.
      self.hideEvaluation();
    }
  };

  /**
   * Check if all answers are filled
   *
   * @returns {boolean} allFilled Returns true if all answers are answered
   */
  DragTextpapijo.prototype.isAllAnswersFilled = function () {
    return this.droppables.every(function (droppable) {
      return droppable.hasDraggable();
    });
  };

  /**
   * Enables all dropzones and all draggables.
   */
  DragTextpapijo.prototype.enableAllDropzonesAndDraggables = function () {
    this.enableDraggables();
    this.droppables.forEach(function (droppable) {
      droppable.enableDropzone();
    });
  };

  /**
   * Disables all draggables, user will not be able to interact with them any more.
   */
  DragTextpapijo.prototype.disableDraggables = function () {
    this.draggables.forEach(function (entry) {
      entry.disableDraggable();
    });
  };

  /**
   * Enables all draggables, user will be able to interact with them again.
   */
  DragTextpapijo.prototype.enableDraggables = function () {
    this.draggables.forEach(function (entry) {
      entry.enableDraggable();
    });
  };

  /**
   * Used for contracts.
   * Checks if the parent program can proceed. Always true.
   *
   * @returns {Boolean} true
   */
  DragTextpapijo.prototype.getAnswerGiven = function () {
    return this.answered;
  };

  /**
   * Used for contracts.
   * Checks the current score for this task.
   *
   * @returns {Number} The current score.
   */
  DragTextpapijo.prototype.getScore = function () {
    return this.calculateScore();
  };

  /**
   * Used for contracts.
   * Checks the maximum score for this task.
   *
   * @returns {Number} The maximum score.
   */
  DragTextpapijo.prototype.getMaxScore = function () {
    return this.droppables.length;
  };

  /**
   * Get title of task
   *
   * @returns {string} title
   */
  DragTextpapijo.prototype.getTitle = function () {
    return H5P.createTitle((this.contentData && this.contentData.metadata && this.contentData.metadata.title) ? this.contentData.metadata.title : 'Drag the Words');
  };

  /**
   * Toogles the drop effect based on if an element is selected
   */
  DragTextpapijo.prototype.toggleDropEffect = function () {
    var hasSelectedElement = this.selectedElement !== undefined;
    this.ariaDropControls[hasSelectedElement ? 'setAllToMove' : 'setAllToNone']();
  };

  /**
   * Returns the Draggable by element
   *
   * @param {HTMLElement} el
   *
   * @returns {H5P.TextDraggable}
   */
  DragTextpapijo.prototype.getDraggableByElement = function (el) {
    return this.draggables.filter(function(draggable){
      return draggable.$draggable.get(0) === el;
    }, this)[0];
  };

  /**
   * Returns the Droppable by element
   *
   * @param {HTMLElement} el
   *
   * @returns {H5P.TextDroppable}
   */
  DragTextpapijo.prototype.getDroppableByElement = function (el) {
    return this.droppables.filter(function(droppable){
      return droppable.$dropzone.get(0) === el;
    }, this)[0];
  };

  /**
   * Used for contracts.
   * Sets feedback on the dropzones.
   */
  DragTextpapijo.prototype.showSolutions = function () {
    this.showEvaluation(true);
    this.droppables.forEach(function (droppable) {
      droppable.addFeedback();
      droppable.showSolution();
    });

    this.removeAllDroppablesFromControls();
    this.disableDraggables();
    //Remove all buttons in "show solution" mode.
    this.hideButton('try-again');
    this.hideButton('show-solution');
    this.hideButton('check-answer');
    this.trigger('resize');
  };

  /**
   * Used for contracts.
   * Resets the complete task back to its' initial state.
   */
  DragTextpapijo.prototype.resetTask = function () {
    var self = this;
    // Reset task answer
    self.answered = false;
    // If keepCorrectAnswers option is enabled, allow resetting dropZones
    this.resetCorrectAnswers = true;
    //Reset draggables parameters and position
    self.resetDraggables();
    // re-disable potential resetting dropZones
    this.resetCorrectAnswers = false; 
    //Hides solution text and re-enable draggables
    self.hideEvaluation();
    self.hideExplanation();
    self.enableAllDropzonesAndDraggables();
    //Show and hide buttons
    self.hideButton('try-again');
    self.hideButton('show-solution');

    if (!self.params.behaviour.instantFeedback) {
      self.showButton('check-answer');
    }
    self.hideAllSolutions();
    self.stopWatch.reset();
    this.trigger('resize');
  };

  /**
   * Resets the position of all draggables shuffled.
   */
  DragTextpapijo.prototype.resetDraggables = function () {
    if (!this.params.behaviour.alphaSort) {
      Util.shuffle(this.draggables).forEach(this.revert, this);
    }
    else {
      this.draggables.forEach(this.revert, this);
    }
  };

  /**
   * Returns an object containing the dropped words
   *
   * @returns {object} containing indexes of dropped words
   */
  DragTextpapijo.prototype.getCurrentState = function () {
    // Return undefined if task is not initialized
    if (this.draggables === undefined) {
      return undefined;
    }

    return this.draggables
      .filter(draggable => (draggable.getInsideDropzone() !== null))
      .map(draggable => ({
        draggable: draggable.getInitialIndex(),
        droppable: this.droppables.indexOf(draggable.getInsideDropzone())
      }));
  };

  /**
   * Sets answers to current user state
   */
  DragTextpapijo.prototype.setH5PUserState = function () {
    const self = this;

    // Do nothing if user state is undefined
    if (this.previousState === undefined) {
      return;
    }

    // Select words from user state
    this.previousState.forEach(indexes => {
      if (!self.isValidIndex(indexes.draggable) || !self.isValidIndex(indexes.droppable)) {
        throw new Error('Stored user state is invalid');
      }

      const moveDraggable = this.getDraggableByInitialIndex(indexes.draggable);
      const moveToDroppable = self.droppables[indexes.droppable];

      self.drop(moveDraggable, moveToDroppable);

      if (self.params.behaviour.instantFeedback) {
        // Add feedback to dropzone
        if (moveToDroppable !== null) {
          moveToDroppable.addFeedback();
        }

        // Add feedback to draggable
        if (moveToDroppable.isCorrect()) {
          moveToDroppable.disableDropzoneAndContainedDraggable();
        }
      }
    });

    // Show evaluation if task is finished
    if (self.params.behaviour.instantFeedback) {

      // Show buttons if not max score and all answers filled
      if (self.isAllAnswersFilled() && !self.showEvaluation()) {

        //Shows "retry" and "show solution" buttons.
        if (self.params.behaviour.enableSolutionsButton) {
          self.initShowShowSolutionButton = true;
        }
        if (self.params.behaviour.enableRetry) {
          self.initShowTryAgainButton = true;
        }
      }
    }
  };

  /**
   * Checks if a number is a valid index
   *
   * @param {number} index
   * @return {boolean}
   */
  DragTextpapijo.prototype.isValidIndex = function(index) {
    return !isNaN(index) && (index < this.draggables.length) && (index >= 0);
  };

  /**
   * Returns the draggable that initially was at an index
   *
   * @param {number} initialIndex
   * @return {Draggable}
   */
  DragTextpapijo.prototype.getDraggableByInitialIndex = function(initialIndex) {
    return this.draggables.filter(draggable => draggable.hasInitialIndex(initialIndex))[0];
  };

  /**
   * getXAPIData
   * Contract used by report rendering engine.
   *
   * @see contract at {@link https://h5p.org/documentation/developers/contracts#guides-header-6}
	 *
   * @returns {Object} xAPI data
   */
  DragTextpapijo.prototype.getXAPIData = function () {
    var xAPIEvent = this.createXAPIEventTemplate('answered');
    this.addQuestionToXAPI(xAPIEvent);
    this.addResponseToXAPI(xAPIEvent);
    return {
      statement: xAPIEvent.data.statement
    };
  };

  /**
   * addQuestionToXAPI
   * Add the question itself to the definition part of an xAPIEvent
   *
   * @param xAPIEvent
   */
  DragTextpapijo.prototype.addQuestionToXAPI = function (xAPIEvent) {
    var definition = xAPIEvent.getVerifiedStatementValue(['object','definition']);
    $.extend(definition, this.getxAPIDefinition());
  };

  /**
   * Generate xAPI object definition used in xAPI statements.
   *
   * @returns {Object}
   */
  DragTextpapijo.prototype.getxAPIDefinition = function () {
    var definition = {};
    definition.interactionType = 'fill-in';
    definition.type = 'http://adlnet.gov/expapi/activities/cmi.interaction';

    // The below replaceAll makes sure we don't get any unwanted XAPI_PLACEHOLDERs in the questions and description
    var question = this.textFieldHtml.replaceAll(/_{10,}/gi, '_________');
    var taskDescription = this.params.taskDescription.replaceAll(/_{10,}/gi, '_________') + '<br/>';

    // Create the description
    definition.description = {
      'en-US': taskDescription + this.replaceSolutionsWithBlanks(question)
    };

    //Create the correct responses pattern
    definition.correctResponsesPattern = [this.getSolutionsFromQuestion(question)];

    return definition;
  };

  /**
   * Add the response part to an xAPI event
   *
   * @param {H5P.XAPIEvent} xAPIEvent
   *  The xAPI event we will add a response to
   */
  DragTextpapijo.prototype.addResponseToXAPI = function (xAPIEvent) {
    var self = this;
    var currentScore = self.getScore();
    var maxScore = self.droppables.length;
    var duration;

    xAPIEvent.setScoredResult(currentScore, maxScore, self);

    var score = {
      min: 0,
      raw: currentScore,
      max: maxScore,
      scaled: Math.round(currentScore / maxScore * 10000) / 10000
    };

    if(self.stopWatch) {
      duration = 'PT' + self.stopWatch.stop() + 'S';
    }

    xAPIEvent.data.statement.result = {
      response: self.getXAPIResponse(),
      score: score,
      duration: duration,
      completion: true
    };
  };

  /**
   * Generate xAPI user response, used in xAPI statements.
   *
   * @returns {string} User answers separated by the "[,]" pattern
   */
  DragTextpapijo.prototype.getXAPIResponse = function () {
     return this.droppables
      .map(droppable => droppable.hasDraggable() ? droppable.containedDraggable.text : '')
      .join('[,]');
  };

	/**
	 * replaceSolutionsWithBlanks
	 *
	 * @param {string} question
	 * @returns {string}
	 */
  DragTextpapijo.prototype.replaceSolutionsWithBlanks = function (question) {
    return parseText(question)
      .map(part => this.isAnswerPart(part) ? '__________' : part)
      .join('');
  };

	/**
	 * Get solutions from question
	 *
	 * @param {string} question
	 * @returns {string} Array with a string containing solutions of a question
	 */
  DragTextpapijo.prototype.getSolutionsFromQuestion = function (question) {
    return parseText(question)
      .filter(this.isAnswerPart)
      .map(part => lex(part))
      .map(solution => solution.text)
      .join('[,]');
  };

  /**
   * Get parsed texts
   *
   * @param {string} question
   * @returns {string} Array with a string containing solutions of a question
   */
  DragTextpapijo.prototype.parseText = function (question) {
    return parseText(question);
  };

  return DragTextpapijo;

}(H5P.jQuery, H5P.Question, H5P.ConfirmationDialog));

/**
 * Static helper method to enable parsing of question text into a format useful
 * for generating reports.
 *
 * PS: The leading backslash for the correct and incorrect feedback within
 * answer parts must be escaped appropriately:
 *
 * Example:
 *
 * question: 'H5P content is *interactive\\+Correct! \\-Incorrect, try again!*.'
 *
 * produces the following:
 *
 * [
 *   {
 *     type: 'text',
 *     content: 'H5P content is '
 *   },
 *   {
 *     type: 'answer',
 *     correct: 'interactive'
 *   },
 *   {
 *     type: 'text',
 *     content: '.'
 *   }
 * ]
 *
 * @param {string} question Question text for an H5P.DragTextpapijo content item
 */
H5P.DragTextpapijo.parseText = function (question) {
  const isAnswerPart = function (part) {
    return Util.startsWith('*', part) && Util.endsWith('*', part);
  };
  return parseText(question)
    .map(part => isAnswerPart(part) ?
      ({
        type: 'answer',
        correct: lex(part).text
      }) :
      ({
        type: 'text',
        content: part
      })
    );
};

export default H5P.DragTextpapijo;
