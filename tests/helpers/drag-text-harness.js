const Module = require('node:module');

const loadDragText = () => {
  const Question = function () {};
  Question.prototype = {};
  Question.determineOverallFeedback = () => '@score of @total';

  const EventDispatcher = function () {};
  EventDispatcher.prototype = {};

  const jquery = value => value;
  jquery.extend = (target, ...sources) => Object.assign(target, ...sources);

  global.H5P = {
    ConfirmationDialog: function () {},
    DragText: {},
    EventDispatcher,
    Question,
    jQuery: jquery
  };

  const controlModules = new Set([
    'h5p-lib-controls/src/scripts/controls',
    'h5p-lib-controls/src/scripts/aria/drag',
    'h5p-lib-controls/src/scripts/aria/drop',
    'h5p-lib-controls/src/scripts/ui/keyboard',
    'h5p-lib-controls/src/scripts/ui/mouse'
  ]);
  const ControlStub = function () {};
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (controlModules.has(request)) {
      return ControlStub;
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    return require('../../src/scripts/drag-text').default;
  }
  finally {
    Module._load = originalLoad;
  }
};

const DragText = loadDragText();

const createElement = textContent => ({
  attributes: {},
  focused: false,
  focus() {
    this.focused = true;
  },
  setAttribute(name, value) {
    this.attributes[name] = value;
  },
  textContent
});

const createDraggable = (initialIndex, text) => {
  const draggable = {
    disabled: false,
    element: createElement(text),
    initialIndex,
    insideDropzone: null,
    reverted: 0,
    text,
    addToZone(droppable) {
      if (this.insideDropzone !== null) {
        this.insideDropzone.removeDraggable();
      }
      this.insideDropzone = droppable;
    },
    appendDraggableTo() {},
    disableDraggable() {
      this.disabled = true;
    },
    enableDraggable() {
      this.disabled = false;
    },
    getAnswerText() {
      return this.text;
    },
    getElement() {
      return this.element;
    },
    getInitialIndex() {
      return this.initialIndex;
    },
    getInsideDropzone() {
      return this.insideDropzone;
    },
    hasCorrectFeedback() {
      return this.insideDropzone !== null && this.insideDropzone.hasCorrectFeedback();
    },
    hasInitialIndex(index) {
      return this.initialIndex === index;
    },
    removeFromZone() {
      const previous = this.insideDropzone;
      if (previous !== null) {
        previous.removeFeedback();
        previous.removeDraggable();
      }
      this.insideDropzone = null;
      return previous;
    },
    revertDraggableTo() {
      this.reverted++;
    }
  };

  return draggable;
};

const createDroppable = (index, correctText) => {
  const element = createElement('');
  const dropzone = {
    widthValue: undefined,
    width(value) {
      this.widthValue = value;
    }
  };

  return {
    containedDraggable: null,
    correctFeedback: null,
    disabled: false,
    element,
    feedbackCorrect: false,
    incorrectFeedback: null,
    index,
    removableBlock: null,
    solutionVisible: false,
    text: [correctText],
    addFeedback() {
      this.feedbackCorrect = this.isCorrect();
    },
    appendInsideDroppableTo(container) {
      if (this.containedDraggable !== null) {
        this.containedDraggable.revertDraggableTo(container);
        return this.containedDraggable;
      }
    },
    disableDropzoneAndContainedDraggable() {
      this.disabled = true;
      if (this.containedDraggable !== null) {
        this.containedDraggable.disableDraggable();
      }
    },
    enableDropzone() {
      this.disabled = false;
    },
    getDropzone() {
      return dropzone;
    },
    getElement() {
      return element;
    },
    getIndex() {
      return this.index;
    },
    hasCorrectFeedback() {
      return this.feedbackCorrect;
    },
    hasDraggable() {
      return this.containedDraggable !== null;
    },
    hideRemovableBlock() {},
    hideSolution() {
      this.solutionVisible = false;
    },
    isCorrect() {
      return this.containedDraggable !== null &&
        this.text.includes(this.containedDraggable.getAnswerText());
    },
    removeDraggable() {
      this.containedDraggable = null;
    },
    removeFeedback() {
      this.feedbackCorrect = false;
    },
    setDraggable(draggable) {
      if (this.containedDraggable === draggable) {
        return;
      }
      if (this.containedDraggable !== null) {
        this.containedDraggable.removeFromZone();
      }
      this.containedDraggable = draggable;
      draggable.addToZone(this);
    },
    showRemovableBlock() {},
    showSolution() {
      this.solutionVisible = true;
    }
  };
};

const createXAPIEvent = verb => {
  const statement = {
    object: { definition: {} },
    verb: { id: `https://adlnet.gov/expapi/verbs/${verb}` }
  };

  return {
    data: { statement },
    getVerifiedStatementValue() {
      return statement.object.definition;
    },
    setScoredResult() {}
  };
};

const createHarness = ({
  answers = ['one', 'two', 'three'],
  instantFeedback = false,
  keepCorrectAnswers = false,
  previousState
} = {}) => {
  const instance = Object.create(DragText.prototype);
  const buttons = {};
  const events = [];
  const draggables = answers.map((text, index) => createDraggable(index, text));
  const droppables = answers.map((text, index) => createDroppable(index, text));

  Object.assign(instance, {
    $draggables: {},
    $introduction: {
      parent: () => ({ focus() {} })
    },
    answered: false,
    buttons,
    contentData: {},
    dragControls: {
      elements: [],
      removeElement() {}
    },
    draggables,
    droppables,
    events,
    params: {
      a11yCheck: 'Check answers',
      a11yRetry: 'Retry task',
      a11yShowSolution: 'Show solution',
      behaviour: {
        alphaSort: true,
        enableCheckButton: true,
        enableRetry: true,
        enableSolutionsButton: true,
        instantFeedback,
        keepCorrectAnswers
      },
      checkAnswer: 'Check',
      dropZoneIndex: 'Drop Zone @index',
      overallFeedback: [],
      scoreBarLabel: 'Score',
      showSolution: 'Show solution',
      submitAnswer: 'Submit',
      taskDescription: 'Task',
      tryAgain: 'Retry'
    },
    previousState,
    selectedElement: undefined,
    stopWatch: {
      resets: 0,
      reset() {
        this.resets++;
      },
      stop: () => 1.25
    },
    textFieldHtml: answers.map(answer => `*${answer}*`).join(' ')
  });

  instance.addButton = (id, label, callback) => {
    buttons[id] = callback;
  };
  instance.createXAPIEventTemplate = createXAPIEvent;
  instance.hideButton = () => {};
  instance.read = () => {};
  instance.removeFeedback = () => {};
  instance.setDraggableAriaLabel = () => {};
  instance.setDroppableLabel = () => {};
  instance.setExplanation = () => {};
  instance.setFeedback = () => {};
  instance.showButton = () => {};
  instance.trigger = (event, data) => {
    events.push({ data, event });
  };

  return { buttons, draggables, droppables, events, instance };
};

module.exports = {
  DragText,
  createHarness
};
