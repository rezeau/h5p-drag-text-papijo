(function (H5PEditor) {
  'use strict';

  var REFERENCE_NAME = 'papijo-tip-ref:v1:';
  var ENCODED_OPEN = '&lt;!--' + REFERENCE_NAME;
  var ENCODED_CLOSE = '--&gt;';
  var RAW_OPEN = '<!--' + REFERENCE_NAME;
  var RAW_CLOSE = '-->';
  var UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function range(start, end) {
    return { start: start, end: end };
  }

  function isEscapedAt(source, index) {
    var count = 0;
    for (var position = index - 1; position >= 0 && source.charAt(position) === '\\'; position--) {
      count++;
    }
    return count % 2 === 1;
  }

  function findReferences(source, offset) {
    var references = [];
    [
      { open: ENCODED_OPEN, close: ENCODED_CLOSE, encoding: 'entity' },
      { open: RAW_OPEN, close: RAW_CLOSE, encoding: 'raw' }
    ].forEach(function (format) {
      var from = 0;
      while (from < source.length) {
        var start = source.indexOf(format.open, from);
        if (start === -1) {
          break;
        }
        var idStart = start + format.open.length;
        var close = source.indexOf(format.close, idStart);
        var end = close === -1 ? source.length : close + format.close.length;
        var rawId = close === -1 ? source.slice(idStart) : source.slice(idStart, close);
        var valid = close !== -1 && UUID_V4.test(rawId);
        references.push({
          encoding: format.encoding,
          id: valid ? rawId : null,
          rawId: rawId,
          range: range(offset + start, offset + end),
          raw: source.slice(start, end),
          reason: close === -1 ? 'unterminated-reference' :
            (valid ? null : 'invalid-reference-id'),
          valid: valid
        });
        from = Math.max(end, start + format.open.length);
      }
    });
    return references.sort(function (left, right) {
      return left.range.start - right.range.start;
    });
  }

  function findMatches(source, expression, offset) {
    var matches = [];
    var match;
    while ((match = expression.exec(source)) !== null) {
      matches.push({
        content: match[1],
        range: range(offset + match.index, offset + match.index + match[0].length),
        raw: match[0]
      });
      if (match.index === expression.lastIndex) {
        expression.lastIndex++;
      }
    }
    return matches;
  }

  function removeRanges(source, ranges) {
    return ranges.slice().sort(function (left, right) {
      return right.start - left.start;
    }).reduce(function (result, item) {
      return result.slice(0, item.start) + result.slice(item.end);
    }, source);
  }

  function scanGap(source, start, end, index) {
    var innerStart = start + 1;
    var innerEnd = end - 1;
    var inner = source.slice(innerStart, innerEnd);
    var references = findReferences(inner, innerStart);
    var tips = findMatches(inner, /::([^\\*]+)/g, innerStart).map(function (tip) {
      var referenceStart = references.reduce(function (current, reference) {
        return reference.range.start >= tip.range.start && reference.range.start < current ?
          reference.range.start : current;
      }, tip.range.end);
      tip.range.end = referenceStart;
      tip.raw = source.slice(tip.range.start, tip.range.end);
      tip.content = source.slice(tip.range.start + 2, tip.range.end);
      return tip;
    });
    var correctFeedback = findMatches(inner, /\\\+([^\\*:]+)/g, innerStart);
    var incorrectFeedback = findMatches(inner, /\\-([^\\*:]+)/g, innerStart);
    var removableBlocks = findMatches(inner, /_([^\\*]+)_/g, innerStart);
    var diagnostics = [];
    if (tips.length > 1) {
      diagnostics.push({ code: 'multiple-tooltip-segments' });
    }
    references.forEach(function (reference) {
      if (!reference.valid) {
        diagnostics.push({ code: reference.reason, range: reference.range });
      }
    });

    var strippedInner = removeRanges(source, references.map(function (reference) {
      return reference.range;
    })).slice(innerStart, innerEnd - references.reduce(function (sum, reference) {
      return sum + reference.range.end - reference.range.start;
    }, 0));
    var preview = strippedInner
      .replace(/::([^\\*]+)/g, '')
      .replace(/\\\+([^\\*:]+)/g, '')
      .replace(/\\-([^\\*:]+)/g, '')
      .replace(/_([^\\*]+)_/g, '')
      .replace(/^-/, '')
      .trim();

    return {
      index: index,
      outer: range(start, end),
      inner: range(innerStart, innerEnd),
      raw: source.slice(start, end),
      references: references,
      tips: tips,
      correctFeedback: correctFeedback,
      incorrectFeedback: incorrectFeedback,
      removableBlocks: removableBlocks,
      diagnostics: diagnostics,
      preview: preview,
      legacyImage: tips.length === 1 && /<img\b/i.test(tips[0].content)
    };
  }

  function scan(source) {
    source = typeof source === 'string' ? source : '';
    var gaps = [];
    var diagnostics = [];
    var open = null;
    for (var position = 0; position < source.length; position++) {
      if (source.charAt(position) !== '*' || isEscapedAt(source, position)) {
        continue;
      }
      if (open === null) {
        open = position;
      }
      else {
        gaps.push(scanGap(source, open, position + 1, gaps.length));
        open = null;
      }
    }
    if (open !== null) {
      diagnostics.push({ code: 'unclosed-gap', range: range(open, source.length) });
    }

    var counts = Object.create(null);
    gaps.forEach(function (gap) {
      gap.references.forEach(function (reference) {
        if (reference.valid) {
          counts[reference.id] = (counts[reference.id] || 0) + 1;
        }
      });
    });
    gaps.forEach(function (gap) {
      if (gap.references.some(function (reference) { return !reference.valid; })) {
        gap.association = { status: 'malformed', id: null };
      }
      else if (gap.references.length === 0) {
        gap.association = { status: 'missing', id: null };
      }
      else if (gap.references.length !== 1) {
        gap.association = { status: 'ambiguous', id: null };
      }
      else if (counts[gap.references[0].id] !== 1) {
        gap.association = { status: 'duplicate', id: null };
      }
      else {
        gap.association = { status: 'valid', id: gap.references[0].id };
      }
    });
    return { source: source, gaps: gaps, diagnostics: diagnostics };
  }

  function getMarker(id) {
    if (!UUID_V4.test(id)) {
      throw new Error('Invalid tooltip UUID');
    }
    return ENCODED_OPEN + id + ENCODED_CLOSE;
  }

  function createUuid() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      var generated = crypto.randomUUID().toLowerCase();
      if (UUID_V4.test(generated)) {
        return generated;
      }
    }
    var bytes = [];
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      bytes = Array.prototype.slice.call(crypto.getRandomValues(new Uint8Array(16)));
    }
    else {
      for (var index = 0; index < 16; index++) {
        bytes.push(Math.floor(Math.random() * 256));
      }
    }
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    var hex = bytes.map(function (value) {
      return value.toString(16).padStart(2, '0');
    }).join('');
    return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' +
      hex.slice(12, 16) + '-' + hex.slice(16, 20) + '-' + hex.slice(20);
  }

  function definitionAnalysis(definitions) {
    var counts = Object.create(null);
    (Array.isArray(definitions) ? definitions : []).forEach(function (definition) {
      if (definition && typeof definition.id === 'string') {
        counts[definition.id] = (counts[definition.id] || 0) + 1;
      }
    });
    return {
      counts: counts,
      getUnique: function (id) {
        if (counts[id] !== 1) {
          return null;
        }
        return definitions.find(function (definition) {
          return definition && definition.id === id;
        }) || null;
      }
    };
  }

  function analyze(source, definitions) {
    var result = scan(source);
    var definitionState = definitionAnalysis(definitions);
    var referenced = Object.create(null);
    result.gaps.forEach(function (gap) {
      var id = gap.association.id;
      var definition = id ? definitionState.getUnique(id) : null;
      if (id) {
        referenced[id] = true;
      }
      gap.definition = definition;
      gap.definitionStatus = !id ? 'none' :
        (definitionState.counts[id] > 1 ? 'duplicate' : (definition ? 'valid' : 'missing'));
      gap.tooltipState = gap.legacyImage ? 'legacy' :
        (gap.tips.length && definition ? 'combined' :
          (definition ? 'image' : (gap.tips.length ? 'text' : 'none')));
      gap.contextBefore = source.slice(Math.max(0, gap.outer.start - 28), gap.outer.start);
      gap.contextAfter = source.slice(gap.outer.end, Math.min(source.length, gap.outer.end + 28));
    });
    result.orphans = (Array.isArray(definitions) ? definitions : []).filter(function (definition) {
      return definition && typeof definition.id === 'string' && !referenced[definition.id];
    });
    result.definitionCounts = definitionState.counts;
    result.safeToReconcile = result.diagnostics.length === 0 && result.gaps.every(function (gap) {
      return gap.association.status !== 'malformed' &&
        gap.association.status !== 'ambiguous' &&
        gap.association.status !== 'duplicate';
    });
    return result;
  }

  function replaceRange(source, target, replacement) {
    return source.slice(0, target.start) + replacement + source.slice(target.end);
  }

  function meaningful(text) {
    var sanitizer = H5PEditor.DragTextPapiJoTooltipSanitizer;
    return sanitizer.textContent(text).trim() !== '';
  }

  function removeLegacyImages(text) {
    return text.replace(/<img\b[^>]*>/gi, '');
  }

  function applyTooltip(options) {
    var source = options.source;
    var definitions = clone(Array.isArray(options.definitions) ? options.definitions : []);
    var analysis = analyze(source, definitions);
    var gap = analysis.gaps[options.gapIndex];
    if (!gap) {
      return { valid: false, reason: 'missing-gap' };
    }
    if (gap.diagnostics.length || gap.association.status === 'ambiguous' ||
        gap.association.status === 'duplicate' || gap.association.status === 'malformed' ||
        gap.definitionStatus === 'duplicate') {
      return { valid: false, reason: 'ambiguous-gap' };
    }

    var existingText = gap.tips.length === 1 ? gap.tips[0].content : '';
    var submittedText = typeof options.text === 'string' ? options.text : '';
    var image = options.image && typeof options.image.path === 'string' &&
      options.image.path.trim() !== '' ? clone(options.image) : undefined;
    var alt = typeof options.alt === 'string' ? options.alt.trim() : '';
    if (image && alt === '') {
      return { valid: false, reason: 'alt-required' };
    }
    if (gap.legacyImage && image && !options.replaceLegacy) {
      return { valid: false, reason: 'legacy-replacement-required' };
    }

    var text;
    if (gap.legacyImage && !options.replaceLegacy) {
      text = submittedText === existingText ? existingText : submittedText;
    }
    else {
      if (options.replaceLegacy) {
        submittedText = removeLegacyImages(submittedText || existingText);
      }
      text = H5PEditor.DragTextPapiJoTooltipSanitizer.sanitize(submittedText.trim());
    }
    var hasText = gap.legacyImage && !options.replaceLegacy ? text.trim() !== '' : meaningful(text);
    if (!hasText && !image) {
      if (gap.tips.length === 0 && gap.association.status === 'missing') {
        return { valid: false, reason: 'tooltip-required' };
      }
      return removeTooltip({
        source: source,
        definitions: definitions,
        gapIndex: options.gapIndex
      });
    }

    if (gap.tips.length === 1) {
      source = replaceRange(source, gap.tips[0].range, hasText ? '::' + text : '');
    }
    else if (hasText) {
      var insertion = gap.inner.end;
      [gap.correctFeedback, gap.incorrectFeedback, gap.references].forEach(function (items) {
        items.forEach(function (item) {
          insertion = Math.min(insertion, item.range.start);
        });
      });
      source = source.slice(0, insertion) + '::' + text + source.slice(insertion);
    }

    var rescannedGap = scan(source).gaps[options.gapIndex];
    var id = gap.association.status === 'valid' ? gap.association.id : null;
    if (image) {
      id = id || (options.idFactory || createUuid)();
      if (!UUID_V4.test(id)) {
        return { valid: false, reason: 'invalid-generated-id' };
      }
      if (!rescannedGap.references.length) {
        source = source.slice(0, rescannedGap.inner.end) + getMarker(id) +
          source.slice(rescannedGap.inner.end);
      }
      var state = definitionAnalysis(definitions);
      if (state.counts[id] > 1) {
        return { valid: false, reason: 'duplicate-definition' };
      }
      var existing = state.getUnique(id);
      if (existing) {
        existing.image = clone(image);
        existing.alt = alt;
      }
      else {
        definitions.push({ id: id, image: clone(image), alt: alt });
      }
    }
    else if (id) {
      rescannedGap = scan(source).gaps[options.gapIndex];
      source = removeRanges(source, rescannedGap.references.map(function (reference) {
        return reference.range;
      }));
      if (definitionAnalysis(definitions).counts[id] === 1) {
        definitions = definitions.filter(function (definition) {
          return !definition || definition.id !== id;
        });
      }
      id = null;
    }

    return { valid: true, source: source, definitions: definitions, id: id };
  }

  function removeTooltip(options) {
    var source = options.source;
    var definitions = clone(Array.isArray(options.definitions) ? options.definitions : []);
    var gap = analyze(source, definitions).gaps[options.gapIndex];
    if (!gap || gap.diagnostics.length || gap.association.status === 'ambiguous' ||
        gap.association.status === 'duplicate' || gap.association.status === 'malformed' ||
        gap.definitionStatus === 'duplicate') {
      return { valid: false, reason: 'ambiguous-gap' };
    }
    var id = gap.association.id;
    var ranges = gap.tips.map(function (tip) { return tip.range; })
      .concat(gap.references.map(function (reference) { return reference.range; }));
    source = removeRanges(source, ranges);
    if (id && definitionAnalysis(definitions).counts[id] === 1) {
      definitions = definitions.filter(function (definition) {
        return !definition || definition.id !== id;
      });
    }
    return { valid: true, source: source, definitions: definitions, id: null };
  }

  function projectSource(source, label) {
    var mappings = [];
    var occupied = source;
    var counter = 1;
    var references = findReferences(source, 0);
    references.forEach(function (reference) {
      var token;
      do {
        // Invisible separators keep repeated placeholders losslessly distinct
        // without exposing an internal ordinal to authors or assistive text.
        token = '⟦' + label + new Array(counter++ + 1).join('\u2063') + '⟧';
      } while (occupied.indexOf(token) !== -1);
      occupied += token;
      mappings.push({ token: token, marker: reference.raw, range: reference.range });
    });
    var display = references.slice().sort(function (left, right) {
      return right.range.start - left.range.start;
    }).reduce(function (result, reference) {
      var mapping = mappings[references.indexOf(reference)];
      return replaceRange(result, reference.range, mapping.token);
    }, source);
    return { display: display, mappings: mappings };
  }

  function restoreSource(display, mappings) {
    return (mappings || []).reduce(function (source, mapping) {
      return source.split(mapping.token).join(mapping.marker);
    }, display);
  }

  function reconcileOrphans(source, definitions) {
    var analysis = analyze(source, definitions);
    if (!analysis.safeToReconcile) {
      return clone(Array.isArray(definitions) ? definitions : []);
    }
    var orphanSet = Object.create(null);
    analysis.orphans.forEach(function (definition) { orphanSet[definition.id] = true; });
    return clone(definitions).filter(function (definition) {
      return !definition || !orphanSet[definition.id];
    });
  }

  H5PEditor.DragTextPapiJoTooltipModel = {
    UUID_V4: UUID_V4,
    analyze: analyze,
    applyTooltip: applyTooltip,
    clone: clone,
    createUuid: createUuid,
    getMarker: getMarker,
    projectSource: projectSource,
    reconcileOrphans: reconcileOrphans,
    removeTooltip: removeTooltip,
    restoreSource: restoreSource,
    scan: scan
  };
})(H5PEditor);
