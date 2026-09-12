import buildStructuredTooltip from './structured-tooltip';

const SPEECH_BUBBLE_GAP = 9;

/**
 * Choose a side using the bubble's rendered height instead of merely choosing
 * the side with the most space (the default JoubelSpeechBubble behaviour).
 *
 * @param {DOMRect} triggerRect
 * @param {DOMRect} bubbleRect
 * @param {DOMRect} containerRect
 * @returns {{available: number, direction: string, fits: boolean}}
 */
const getSpeechBubblePlacement = (triggerRect, bubbleRect, containerRect) => {
  const above = Math.max(0, triggerRect.top - containerRect.top - SPEECH_BUBBLE_GAP);
  const below = Math.max(0, containerRect.bottom - triggerRect.bottom - SPEECH_BUBBLE_GAP);
  let direction = 'bottom';

  if (bubbleRect.height > below) {
    direction = bubbleRect.height <= above || above > below ? 'top' : 'bottom';
  }

  const available = direction === 'top' ? above : below;
  return { available, direction, fits: bubbleRect.height <= available };
};

/**
 * Plan placement against the container height without any space previously
 * reserved for the current tooltip.
 *
 * @param {DOMRect} triggerRect
 * @param {DOMRect} bubbleRect
 * @param {DOMRect} containerRect
 * @param {number} currentReservedSpace
 * @returns {{direction: string, fits: boolean, reservedSpace: number}}
 */
const getSpeechBubbleLayoutPlan = (
  triggerRect,
  bubbleRect,
  containerRect,
  currentReservedSpace = 0
) => {
  const naturalContainerRect = {
    bottom: containerRect.bottom - currentReservedSpace,
    top: containerRect.top
  };
  const placement = getSpeechBubblePlacement(
    triggerRect,
    bubbleRect,
    naturalContainerRect
  );

  if (placement.fits) {
    return { direction: placement.direction, fits: true, reservedSpace: 0 };
  }

  const naturalBelow = Math.max(
    0,
    naturalContainerRect.bottom - triggerRect.bottom - SPEECH_BUBBLE_GAP
  );
  return {
    direction: 'bottom',
    fits: false,
    reservedSpace: Math.ceil(bubbleRect.height - naturalBelow)
  };
};

const watchSpeechBubbleImages = (images, onSettled) => {
  Array.from(images || []).forEach((image) => {
    if (image.complete) {
      onSettled();
      return;
    }
    const handleSettled = function () {
      image.removeEventListener('load', handleSettled);
      image.removeEventListener('error', handleSettled);
      onSettled();
    };
    image.addEventListener('load', handleSettled);
    image.addEventListener('error', handleSettled);
  });
};

const eventTargetIsWithin = (element, target) => Boolean(
  element && target && (
    element === target ||
    (typeof element.contains === 'function' && element.contains(target))
  )
);

const getAccessibleAncestorDocuments = (startWindow, fallbackDocument) => {
  if (!startWindow) {
    return fallbackDocument ? [fallbackDocument] : [];
  }

  const documents = [];
  let currentWindow = startWindow;
  while (currentWindow) {
    try {
      const currentDocument = currentWindow.document;
      if (!currentDocument || documents.includes(currentDocument)) {
        break;
      }
      documents.push(currentDocument);
      if (!currentWindow.parent || currentWindow.parent === currentWindow) {
        break;
      }
      currentWindow = currentWindow.parent;
    }
    catch (error) {
      // Stop at a cross-origin boundary. Documents already reached remain usable.
      break;
    }
  }
  return documents;
};

H5P.JoubelTip = (function ($) {
  const $conv = $('<div/>');
  let $expandedTipButton;
  let $expandedTipAnnouncer;
  let closeExpandedTip;

  /**
   * Creates a new tip element.
   *
   * NOTE that this may look like a class but it doesn't behave like one.
   * It returns a jQuery object.
   *
   * @param {string} tipHtml The text to display in the popup
   * @param {Object} [behaviour] Options
   * @param {string} [behaviour.tipLabel] Set to use a custom label for the tip button (you want this for good A11Y)
   * @param {boolean} [behaviour.helpIcon] Set to 'true' to Add help-icon classname to Tip button (changes the icon)
   * @param {boolean} [behaviour.showSpeechBubble] Set to 'false' to disable functionality (you may this in the editor)
   * @param {boolean} [behaviour.tabcontrol] Set to 'true' if you plan on controlling the tabindex in the parent (tabindex="-1")
   * @return {H5P.jQuery|undefined} Tip button jQuery element or 'undefined' if invalid tip
   */
  function JoubelTip(tipHtml, behaviour) {

    // Keep track of the popup that appears when you click the Tip button
    let speechBubble;
    let $renderedSpeechBubble;
    let outsidePointerDocuments = [];
    let layoutGeneration = 0;
    let reservedSpace = 0;
    const structured = behaviour && behaviour.structuredTooltip ?
      buildStructuredTooltip(behaviour.structuredTooltip) : null;
    const isStructured = Boolean(structured);
    if (isStructured) {
      tipHtml = structured.html;
    }

    // Check if legacy tipHtml contains one or more images.
    let imgLen;
    const regex = /(.?><img\s+)src="(.*?)"|width="(.*?)"|(width: ?(\d*))(.*?)>/gm;
    const reg = /^\d+$/;
    let m;
    while ((m = regex.exec(tipHtml)) !== null) {
      // This is necessary to avoid infinite loops with zero-width matches
      if (m.index === regex.lastIndex) {
        regex.lastIndex++;
      }
      // The result can be accessed through the `m`-variable.
      m.forEach((matchIt) => {
        if (matchIt && matchIt.match(reg)) {
          imgLen = Number(matchIt);
        }
      });
    }

    // Parse tip html to determine text
    let tipText = isStructured ? structured.text : $conv.html(tipHtml).text().trim();
    if (tipText === '') {
      return; // The tip has no textual content, i.e. it's invalid.
    }

    let tipTextLen = getWidthOfText(tipText, 'Sans-Serif', '16px');
    if (isStructured && structured.hasImage) {
      tipTextLen = Math.max(240, tipTextLen);
    }
    if (imgLen !== undefined) {
      tipTextLen = Math.max(imgLen, tipTextLen);
    }
    tipTextLen += 25; // To compensate for tooltip margins.
    tipTextLen = Math.min(400, tipTextLen);

    // Set default behaviour
    behaviour = $.extend({
      tipLabel: tipText,
      helpIcon: false,
      showSpeechBubble: true,
      tabcontrol: false
    }, behaviour);

    // Create Tip button
    const $tipButton = $('<div/>', {
      class: 'joubel-tip-container' + (behaviour.showSpeechBubble ? '' : ' be-quiet'),
      'aria-label': behaviour.tipLabel,
      'aria-expanded': false,
      role: 'button',
      tabindex: (behaviour.tabcontrol ? -1 : 0),
      click: function (event) {
        // Toggle show/hide popup
        toggleSpeechBubble();
        event.preventDefault();
      },
      keydown: function (event) {
        if (event.which === 32 || event.which === 13) { // Space & enter key
          // Toggle show/hide popup
          toggleSpeechBubble();
          event.stopPropagation();
          event.preventDefault();
        }
        else { // Any other key
          // Toggle hide popup
          toggleSpeechBubble(false);
        }
      },
      mousedown: function (event) {
        // The official body listener only excludes an exact trigger target.
        // Keep descendant icon targets from closing on mousedown and reopening
        // on the click that follows.
        if (speechBubble !== undefined && speechBubble.isCurrent($tipButton)) {
          event.stopPropagation();
        }
      },
      // Add markup to render icon
      html: '<span class="joubel-icon-tip-normal ' + (behaviour.helpIcon ? ' help-icon' : '') + '">' +
              '<span class="h5p-icon-shadow"></span>' +
              '<span class="h5p-icon-speech-bubble"></span>' +
              '<span class="h5p-icon-info"></span>' +
            '</span>'
      // IMPORTANT: All of the markup elements must have 'pointer-events: none;'
    });

    const $tipAnnouncer = $('<div>', {
      'class': 'hidden-but-read',
      'aria-live': 'polite',
      appendTo: $tipButton,
    });

    const getBubbleLayout = function () {
      if (typeof $tipButton.closest !== 'function') {
        return null;
      }
      let $h5pContainer = $tipButton.closest('.h5p-frame');
      if (!$h5pContainer.length) {
        $h5pContainer = $tipButton.closest('.h5p-container');
      }
      if (!$h5pContainer.length) {
        return null;
      }

      const $bubble = $renderedSpeechBubble && $renderedSpeechBubble.length ?
        $renderedSpeechBubble : $h5pContainer.find('.joubel-speech-bubble').last();
      if (!$bubble.length) {
        return null;
      }

      return { $bubble, $h5pContainer };
    };

    const positionSpeechBubble = function () {
      if (speechBubble === undefined || !speechBubble.isCurrent($tipButton)) {
        return;
      }

      const layout = getBubbleLayout();
      if (!layout) {
        return;
      }

      const $innerBubble = layout.$bubble.find('.joubel-speech-bubble-inner');
      $innerBubble.css({ boxSizing: '', maxHeight: '', overflowY: '' });

      const triggerRect = $tipButton[0].getBoundingClientRect();
      const bubbleRect = layout.$bubble[0].getBoundingClientRect();
      const containerRect = layout.$h5pContainer[0].getBoundingClientRect();
      const plan = getSpeechBubbleLayoutPlan(
        triggerRect,
        bubbleRect,
        containerRect,
        reservedSpace
      );
      const canReserveSpace = typeof behaviour.setReservedSpace === 'function';
      const targetReservedSpace = canReserveSpace ? plan.reservedSpace : 0;

      if (targetReservedSpace !== reservedSpace) {
        reservedSpace = targetReservedSpace;
        behaviour.setReservedSpace(reservedSpace);
        queueSpeechBubblePosition();
        return;
      }

      const above = Math.max(0, triggerRect.top - containerRect.top - SPEECH_BUBBLE_GAP);
      const below = Math.max(0, containerRect.bottom - triggerRect.bottom - SPEECH_BUBBLE_GAP);
      const actualAvailable = plan.direction === 'top' ? above : below;
      const actuallyFits = bubbleRect.height <= actualAvailable;
      const isTop = plan.direction === 'top';

      layout.$bubble
        .toggleClass('joubel-speech-bubble-top', isTop)
        .toggleClass('joubel-speech-bubble-bottom', !isTop)
        .css(isTop ? {
          bottom: `${containerRect.bottom - triggerRect.top + SPEECH_BUBBLE_GAP}px`,
          top: ''
        } : {
          bottom: '',
          top: `${triggerRect.bottom - containerRect.top}px`
        });

      layout.$bubble
        .find('.joubel-speech-bubble-tail, .joubel-speech-bubble-inner-tail')
        .css(isTop ? { bottom: '-6px', top: '' } : { bottom: '', top: '-6px' });

      // Reservation should make the full bubble fit. Keep scrolling only as a
      // safety net for fixed-height/fullscreen hosts that reject that growth.
      $innerBubble.css(actuallyFits ? {
        boxSizing: '',
        maxHeight: '',
        overflowY: ''
      } : {
        boxSizing: 'border-box',
        maxHeight: `${Math.max(0, Math.max(above, below))}px`,
        overflowY: 'auto'
      });
    };

    const queueSpeechBubblePosition = function () {
      const generation = ++layoutGeneration;
      const positionCurrentBubble = function () {
        if (generation === layoutGeneration) {
          positionSpeechBubble();
        }
      };
      if (typeof window !== 'undefined' && window.requestAnimationFrame) {
        window.requestAnimationFrame(function () {
          window.requestAnimationFrame(positionCurrentBubble);
        });
      }
      else {
        setTimeout(positionCurrentBubble, 0);
      }
    };

    const refreshSpeechBubbleLayout = function () {
      if (speechBubble === undefined || !speechBubble.isCurrent($tipButton)) {
        return;
      }
      if (typeof behaviour.onResize === 'function') {
        behaviour.onResize();
      }
      queueSpeechBubblePosition();
    };

    const handleOutsidePointerDown = function (event) {
      if (eventTargetIsWithin($tipButton[0], event.target) ||
        eventTargetIsWithin($renderedSpeechBubble && $renderedSpeechBubble[0], event.target)) {
        return;
      }
      closeCurrentSpeechBubble();
    };

    const removeOutsidePointerListeners = function () {
      outsidePointerDocuments.forEach((pointerDocument) => {
        pointerDocument.removeEventListener('pointerdown', handleOutsidePointerDown, true);
      });
      outsidePointerDocuments = [];
    };

    const addOutsidePointerListeners = function () {
      removeOutsidePointerListeners();
      outsidePointerDocuments = getAccessibleAncestorDocuments(
        typeof window === 'undefined' ? undefined : window,
        typeof document === 'undefined' ? undefined : document
      );
      outsidePointerDocuments.forEach((pointerDocument) => {
        pointerDocument.addEventListener('pointerdown', handleOutsidePointerDown, true);
      });
    };

    const releaseSpeechBubbleLayout = function () {
      layoutGeneration++;
      removeOutsidePointerListeners();
      if (reservedSpace !== 0 && typeof behaviour.setReservedSpace === 'function') {
        reservedSpace = 0;
        behaviour.setReservedSpace(0);
      }
      if (H5P.$window) {
        H5P.$window.off('resize.papijoSpeechBubble');
      }
      if (closeExpandedTip === closeCurrentSpeechBubble) {
        closeExpandedTip = undefined;
      }
    };

    const removeRenderedSpeechBubble = function () {
      if ($renderedSpeechBubble && $renderedSpeechBubble.length) {
        // JoubelSpeechBubble.remove() deliberately leaves the fading element
        // in the DOM for 500 ms. Its cleanup still runs, but mouse/keyboard
        // close must remove the visible popup synchronously.
        $renderedSpeechBubble.remove();
        $renderedSpeechBubble = undefined;
      }
    };

    const closeSpeechBubbleState = function () {
      releaseSpeechBubbleLayout();
      speechBubble = undefined;
      $tipButton.attr('aria-expanded', false);
      $tipAnnouncer.html('');
      if ($expandedTipButton && $expandedTipButton[0] === $tipButton[0]) {
        $expandedTipButton = undefined;
        $expandedTipAnnouncer = undefined;
      }
    };

    const closeCurrentSpeechBubble = function () {
      if (speechBubble !== undefined && speechBubble.isCurrent($tipButton)) {
        speechBubble.remove();
      }
      removeRenderedSpeechBubble();
      closeSpeechBubbleState();
    };

    const watchBubbleImages = function () {
      const layout = getBubbleLayout();
      if (!layout) {
        return;
      }

      watchSpeechBubbleImages(layout.$bubble.find('img').get(), refreshSpeechBubbleLayout);
    };

    /**
     * Tip button interaction handler.
     * Toggle show or hide the speech bubble popup when interacting with the
     * Tip button.
     *
     * @private
     * @param {boolean} [force] 'true' shows and 'false' hides.
     */
    let toggleSpeechBubble = function (force) {
      if (speechBubble !== undefined && speechBubble.isCurrent($tipButton)) {
        // Hide current popup
        closeCurrentSpeechBubble();
      }
      else if (force !== false && behaviour.showSpeechBubble) {
        if ($expandedTipButton && $expandedTipButton[0] !== $tipButton[0]) {
          if (closeExpandedTip) {
            closeExpandedTip();
          }
        }
        // Create and show new popup
        speechBubble = H5P.JoubelSpeechBubble($tipButton, tipHtml, tipTextLen);
        const layout = getBubbleLayout();
        $renderedSpeechBubble = layout ? layout.$bubble : undefined;
        if ($renderedSpeechBubble) {
          $renderedSpeechBubble
            .off('mousedown.papijoSpeechBubble')
            .on('mousedown.papijoSpeechBubble', function (event) {
              event.stopPropagation();
            });
        }
        $tipButton.attr('aria-expanded', true);
        $tipAnnouncer.html(tipHtml);
        $expandedTipButton = $tipButton;
        $expandedTipAnnouncer = $tipAnnouncer;
        closeExpandedTip = closeCurrentSpeechBubble;
        addOutsidePointerListeners();
        if (H5P.$window) {
          H5P.$window
            .off('resize.papijoSpeechBubble')
            .on('resize.papijoSpeechBubble', refreshSpeechBubbleLayout);
        }
        refreshSpeechBubbleLayout();
        watchBubbleImages();
      }
    };

    $tipButton.hideSpeechBubble = function () {
      toggleSpeechBubble(false);
      $tipButton.attr('aria-expanded', false);
      $tipAnnouncer.html('');
      if ($expandedTipButton && $expandedTipButton[0] === $tipButton[0]) {
        $expandedTipButton = undefined;
        $expandedTipAnnouncer = undefined;
      }
    };

    return $tipButton;
  }

  /* see https://stackoverflow.com/questions/2057682/determine-pixel-length-of-string-in-javascript-jquery */
  function getWidthOfText(txt, fontname, fontsize) {
    if (getWidthOfText.c === undefined) {
      getWidthOfText.c = document.createElement('canvas');
      getWidthOfText.ctx = getWidthOfText.c.getContext('2d');
    }
    let fontspec = fontsize + ' ' + fontname;
    if (getWidthOfText.ctx.font !== fontspec)
      getWidthOfText.ctx.font = fontspec;
    return getWidthOfText.ctx.measureText(txt).width;
  }

  return JoubelTip;
})(H5P.jQuery);

export {
  eventTargetIsWithin,
  getAccessibleAncestorDocuments,
  getSpeechBubbleLayoutPlan,
  getSpeechBubblePlacement,
  watchSpeechBubbleImages
};
