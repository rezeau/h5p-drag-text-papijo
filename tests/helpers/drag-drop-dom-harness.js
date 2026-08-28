const Module = require('node:module');

class FakeElement {
  constructor(tagName = 'div') {
    this.attributes = {};
    this.attributeOrder = [];
    this.children = [];
    this.classes = new Set();
    this.eventListeners = {};
    this.focused = false;
    this.hidden = false;
    this.htmlContent = '';
    this.offsetValue = { left: 0, top: 0 };
    this.parent = null;
    this.style = {};
    this.tagName = tagName.toUpperCase();
  }

  addEventListener(type, listener) {
    this.eventListeners[type] = this.eventListeners[type] || [];
    if (!this.eventListeners[type].includes(listener)) {
      this.eventListeners[type].push(listener);
    }
  }

  dispatchEvent(event) {
    event.currentTarget = this;
    (this.eventListeners[event.type] || []).forEach(listener => listener(event));
  }

  focus() {
    global.document.activeElement = this;
    this.focused = true;
  }

  getAttribute(name) {
    return this.attributes[name] === undefined ? null : this.attributes[name];
  }

  hasAttribute(name) {
    return this.attributes[name] !== undefined;
  }

  removeAttribute(name) {
    const index = this.attributeOrder.indexOf(name);
    if (index !== -1) {
      this.attributeOrder.splice(index, 1);
      this.attributeOrder.forEach((attributeName, attributeIndex) => {
        this.attributes[attributeIndex] = {
          name: attributeName,
          value: this.attributes[attributeName]
        };
      });
      delete this.attributes[this.attributeOrder.length];
    }
    delete this.attributes[name];
  }

  removeEventListener(type, listener) {
    this.eventListeners[type] = (this.eventListeners[type] || [])
      .filter(candidate => candidate !== listener);
  }

  setAttribute(name, value) {
    const stringValue = String(value);
    if (!this.attributeOrder.includes(name)) {
      this.attributeOrder.push(name);
    }
    this.attributes[name] = stringValue;
    this.attributeOrder.forEach((attributeName, index) => {
      this.attributes[index] = {
        name: attributeName,
        value: this.attributes[attributeName]
      };
    });
  }

  get classList() {
    return {
      add: (...names) => names.forEach(name => this.classes.add(name)),
      contains: name => this.classes.has(name),
      remove: (...names) => names.forEach(name => this.classes.delete(name)),
      toggle: (name, force) => {
        const enabled = force === undefined ? !this.classes.has(name) : force;
        this.classes[enabled ? 'add' : 'delete'](name);
      }
    };
  }

  get childNodes() {
    return this.children;
  }

  get textContent() {
    if (this.children.length > 0) {
      return this.children.map(child => child.textContent).join('');
    }
    return this.htmlContent
      .replace(/<[^>]*>/g, '')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, '&');
  }
}

const detachElement = element => {
  if (element.parent) {
    element.parent.children = element.parent.children.filter(child => child !== element);
    element.parent = null;
  }
};

class FakeQuery {
  constructor(elements) {
    this.elements = elements;
    this.length = elements.length;
    elements.forEach((element, index) => {
      this[index] = element;
    });
  }

  addClass(names) {
    names.split(/\s+/).filter(Boolean).forEach(name => {
      this.elements.forEach(element => element.classes.add(name));
    });
    return this;
  }

  animate(styles) {
    this.elements.forEach(element => Object.assign(element.style, styles));
    return this;
  }

  append(value) {
    const children = normalizeElements(value);
    this.elements.forEach(parent => {
      children.forEach(child => {
        detachElement(child);
        parent.children.push(child);
        child.parent = parent;
      });
    });
    return this;
  }

  appendTo(value) {
    $(value).append(this);
    return this;
  }

  attr(name, value) {
    if (value === undefined) {
      return this.elements[0]?.getAttribute(name);
    }
    this.elements.forEach(element => element.setAttribute(name, value));
    return this;
  }

  blur(handler) {
    return handler ? this.on('blur', handler) : this;
  }

  css(name, value) {
    const styles = typeof name === 'object' ? name : { [name]: value };
    this.elements.forEach(element => Object.assign(element.style, styles));
    return this;
  }

  children() {
    return new FakeQuery(this.elements.flatMap(element => element.children));
  }

  detach() {
    this.elements.forEach(detachElement);
    return this;
  }

  draggable(options) {
    this.elements.forEach(element => {
      element.draggableOptions = Object.assign(element.draggableOptions || {}, options);
      if (options && options.disabled !== undefined) {
        element.setAttribute('aria-disabled', options.disabled);
      }
    });
    return this;
  }

  droppable(options) {
    this.elements.forEach(element => {
      element.droppableOptions = Object.assign(element.droppableOptions || {}, options);
      if (options && options.disabled !== undefined) {
        element.setAttribute('aria-disabled', options.disabled);
      }
    });
    return this;
  }

  find(selector) {
    const matches = [];
    const visit = element => {
      element.children.forEach(child => {
        if ((selector.startsWith('.') && child.classes.has(selector.slice(1))) ||
          (!selector.startsWith('.') && child.tagName.toLowerCase() === selector.toLowerCase())) {
          matches.push(child);
        }
        visit(child);
      });
    };
    this.elements.forEach(visit);
    return new FakeQuery(matches);
  }

  focus(handler) {
    if (handler) {
      return this.on('focus', handler);
    }
    this.elements[0]?.focus();
    return this;
  }

  get(index) {
    return this.elements[index];
  }

  hasClass(name) {
    return this.elements[0]?.classes.has(name) || false;
  }

  hide() {
    this.elements.forEach(element => {
      element.hidden = true;
    });
    return this;
  }

  html(value) {
    if (value === undefined) {
      return this.elements[0]?.htmlContent;
    }
    this.elements.forEach(element => {
      element.htmlContent = String(value);
    });
    return this;
  }

  is(selector) {
    const element = this.elements[0];
    if (selector === ':focus') {
      return global.document.activeElement === element;
    }
    if (selector === ':empty') {
      return element.children.length === 0 && element.htmlContent === '';
    }
    return false;
  }

  offset() {
    return this.elements[0]?.offsetValue || { left: 0, top: 0 };
  }

  on(types, handler) {
    types.split(/\s+/).forEach(type => {
      this.elements.forEach(element => element.addEventListener(type, handler));
    });
    return this;
  }

  prepend(value) {
    const children = normalizeElements(value);
    this.elements.forEach(parent => {
      [...children].reverse().forEach(child => {
        detachElement(child);
        parent.children.unshift(child);
        child.parent = parent;
      });
    });
    return this;
  }

  prependTo(value) {
    $(value).prepend(this);
    return this;
  }

  remove() {
    this.elements.forEach(detachElement);
    return this;
  }

  removeClass(names) {
    names.split(/\s+/).filter(Boolean).forEach(name => {
      this.elements.forEach(element => element.classes.delete(name));
    });
    return this;
  }

  show() {
    this.elements.forEach(element => {
      element.hidden = false;
    });
    return this;
  }

  text(value) {
    if (value === undefined) {
      return this.elements[0]?.textContent;
    }
    return this.html(value);
  }

  toggleClass(name, force) {
    this.elements.forEach(element => element.classList.toggle(name, force));
    return this;
  }

  width(value) {
    if (value === undefined) {
      return this.elements[0]?.style.width;
    }
    this.elements.forEach(element => {
      element.style.width = value;
    });
    return this;
  }
}

const normalizeElements = value => {
  if (value instanceof FakeQuery) {
    return value.elements;
  }
  if (value instanceof FakeElement) {
    return [value];
  }
  return [];
};

const $ = (value, attributes = {}) => {
  if (value instanceof FakeQuery) {
    return value;
  }
  if (value instanceof FakeElement) {
    return new FakeQuery([value]);
  }
  if (typeof value === 'string' && value.startsWith('<')) {
    const tagName = value.match(/^<([a-z0-9]+)/i)?.[1] || 'div';
    const element = new FakeElement(tagName);
    Object.entries(attributes).forEach(([name, attributeValue]) => {
      if (name === 'class') {
        attributeValue.split(/\s+/).filter(Boolean).forEach(className => element.classes.add(className));
        element.setAttribute('class', attributeValue);
      }
      else if (name === 'html') {
        element.htmlContent = String(attributeValue);
      }
      else if (name === 'appendTo') {
        $(attributeValue).append(element);
      }
      else if (typeof attributeValue === 'function') {
        element.addEventListener(name, attributeValue);
      }
      else {
        element.setAttribute(name, attributeValue);
      }
    });
    return new FakeQuery([element]);
  }
  return new FakeQuery([]);
};

$.extend = (target, ...sources) => Object.assign(target, ...sources);

const EventDispatcher = function () {
  this.handlers = {};
};
EventDispatcher.prototype.on = function (name, handler, context) {
  this.handlers[name] = this.handlers[name] || [];
  this.handlers[name].push({ context, handler });
};
EventDispatcher.prototype.trigger = function (name, data) {
  (this.handlers[name] || []).forEach(entry => entry.handler.call(entry.context || this, { data }));
};

const Question = function () {
  EventDispatcher.call(this);
};
Question.prototype = Object.create(EventDispatcher.prototype);
Question.determineOverallFeedback = () => '@score of @total';

global.document = {
  activeElement: null,
  createElement(tagName) {
    if (tagName === 'canvas') {
      return {
        getContext: () => ({
          font: '',
          measureText: text => ({ width: text.length * 8 })
        })
      };
    }
    return new FakeElement(tagName);
  }
};
const speechBubbles = [];
let currentSpeechBubble;
const resetSpeechBubbles = () => {
  speechBubbles.length = 0;
  currentSpeechBubble = undefined;
};
const tooltipCalls = [];
global.H5P = {
  ConfirmationDialog: function () {},
  DragText: {},
  EventDispatcher,
  JoubelUI: {
    createTip: (...args) => global.H5P.JoubelTip ? global.H5P.JoubelTip(...args) : $('<button/>')
  },
  JoubelSpeechBubble: (button, html, width) => {
    if (currentSpeechBubble && !currentSpeechBubble.removed) {
      currentSpeechBubble.remove();
    }
    const bubble = {
      button,
      html,
      removed: false,
      width,
      isCurrent(candidate) {
        return !this.removed && currentSpeechBubble === this && candidate === this.button;
      },
      remove() {
        this.removed = true;
      }
    };
    speechBubbles.push(bubble);
    currentSpeechBubble = bubble;
    return bubble;
  },
  Question,
  Tooltip: (element, options) => {
    tooltipCalls.push({ element, options });
    const tooltip = new FakeElement('div');
    tooltip.classes.add('h5p-tooltip');
    $(element).append(tooltip);
  },
  jQuery: $
};

const controlModules = new Set([
  'h5p-lib-controls/src/scripts/controls',
  'h5p-lib-controls/src/scripts/aria/drag',
  'h5p-lib-controls/src/scripts/aria/drop',
  'h5p-lib-controls/src/scripts/ui/keyboard',
  'h5p-lib-controls/src/scripts/ui/mouse'
]);
const ControlStub = function () {
  this.elements = [];
  this.handlers = {};
};
ControlStub.prototype.addElement = function (element) {
  if (!this.elements.includes(element)) {
    this.elements.push(element);
  }
};
ControlStub.prototype.insertElementAt = function (element, position) {
  if (!this.elements.includes(element)) {
    this.elements.splice(position, 0, element);
  }
};
ControlStub.prototype.on = function (name, handler, context) {
  this.handlers[name] = this.handlers[name] || [];
  this.handlers[name].push({ context, handler });
};
ControlStub.prototype.removeElement = function (element) {
  this.elements = this.elements.filter(candidate => candidate !== element);
};
ControlStub.prototype.setAllToNone = function () {};
ControlStub.prototype.setTabbable = function (element) {
  this.elements.forEach(candidate => candidate.setAttribute('tabindex', '-1'));
  element.setAttribute('tabindex', '0');
};
ControlStub.prototype.useNegativeTabIndex = function () {};
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (controlModules.has(request)) {
    return ControlStub;
  }
  return originalLoad.call(this, request, parent, isMain);
};

let DragText;
let Draggable;
let Droppable;
try {
  Draggable = require('../../src/scripts/draggable').default;
  Droppable = require('../../src/scripts/droppable').default;
  DragText = require('../../src/scripts/drag-text').default;
}
finally {
  Module._load = originalLoad;
}

const createControls = () => ({
  elements: [],
  addElement(element) {
    if (!this.elements.includes(element)) {
      this.elements.push(element);
    }
  },
  insertElementAt(element, position) {
    if (!this.elements.includes(element)) {
      this.elements.splice(position, 0, element);
    }
  },
  removeElement(element) {
    this.elements = this.elements.filter(candidate => candidate !== element);
  },
  setTabbable(element) {
    this.elements.forEach(candidate => candidate.setAttribute('tabindex', '-1'));
    element.setAttribute('tabindex', '0');
  }
});

const createParentHarness = ({
  instantFeedback = false,
  keepCorrectAnswers = false,
  showSolutionsRequiresInput = false,
  wireLifecycle = true
} = {}) => {
  const instance = Object.create(DragText.prototype);
  EventDispatcher.call(instance);
  const buttons = {};
  const buttonVisibility = {};
  const eventLog = [];
  const introductionParent = $('<div/>');
  const originalTrigger = instance.trigger;

  Object.assign(instance, {
    $draggables: $('<div/>'),
    $introduction: { parent: () => introductionParent },
    $introductionParent: introductionParent,
    $taskContainer: $('<div/>'),
    $wordContainer: $('<div/>'),
    answered: false,
    buttons,
    buttonVisibility,
    contentData: {},
    dragControls: createControls(),
    draggables: [],
    dropControls: createControls(),
    droppables: [],
    hoveredDroppables: [],
    params: {
      cancelledDragging: 'Cancelled',
      contains: 'Drop Zone @index contains draggable @draggable.',
      correctAnswer: 'Correct answer:',
      correctText: 'Correct!',
      dropZoneIndex: 'Drop Zone @index',
      empty: 'Drop Zone @index is empty.',
      incorrectText: 'Incorrect!',
      tipLabel: 'Show tip',
      behaviour: {
        alphaSort: true,
        enableCheckButton: true,
        enableRetry: true,
        enableSolutionsButton: true,
        showSolutionsRequiresInput,
        hideTips: false,
        instantFeedback,
        keepCorrectAnswers,
        transparentBackground: false
      },
      a11yCheck: 'Check answers',
      a11yRetry: 'Retry task',
      a11yShowSolution: 'Show solution',
      checkAnswer: 'Check',
      overallFeedback: [],
      scoreBarLabel: 'Score',
      showSolution: 'Show solution',
      submitAnswer: 'Submit',
      taskDescription: 'Task',
      tryAgain: 'Retry'
    },
    read() {},
    removeFeedback() {},
    selectedElement: undefined,
    setExplanation() {},
    setFeedback() {},
    setDraggableAriaLabel(draggable) {
      return draggable;
    },
    stopWatch: {
      reset() {},
      stop: () => 1
    },
    textFieldHtml: '*one* *two*',
    triggerXAPI(verb) {
      eventLog.push({ name: `xapi:${verb}` });
    },
    trigger(name, data) {
      eventLog.push({ data, name });
      originalTrigger.call(this, name, data);
    }
  });

  if (wireLifecycle) {
    instance.on('drop', event => {
      instance.dragControls.removeElement(event.data.element);
      event.data.element.setAttribute('tabindex', '-1');
    });
    instance.on('revert', event => {
      const draggable = instance.getDraggableByElement(event.data.element);
      if (draggable) {
        instance.addDraggableToControls(instance.dragControls, draggable, 0);
      }
    });
    instance.on('drop', instance.updateDroppableElement, instance);
    instance.on('revert', instance.updateDroppableElement, instance);
  }

  instance.addButton = (id, label, callback, visible) => {
    buttons[id] = callback;
    buttonVisibility[id] = Boolean(visible);
  };
  instance.createXAPIEventTemplate = verb => {
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
  instance.hideButton = id => {
    buttonVisibility[id] = false;
  };
  instance.showButton = id => {
    buttonVisibility[id] = true;
  };

  return { buttons, buttonVisibility, eventLog, instance };
};

module.exports = {
  $,
  DragText,
  Draggable,
  Droppable,
  FakeElement,
  createParentHarness,
  resetSpeechBubbles,
  speechBubbles,
  tooltipCalls
};
