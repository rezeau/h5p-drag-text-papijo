const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const hasUnsafePathShape = path => {
  if (path.indexOf('\0') !== -1 || path.indexOf('\\') !== -1 ||
      /^[a-z][a-z0-9+.-]*:/i.test(path) || /^\/\//.test(path) ||
      /^\//.test(path)) {
    return true;
  }
  const segments = path.split('/');
  return segments.some(segment => segment === '' || segment === '.' || segment === '..');
};

const isManagedImagePath = path => {
  if (typeof path !== 'string' || path.trim() === '' || path !== path.trim() ||
      hasUnsafePathShape(path)) {
    return false;
  }
  try {
    let decoded = path;
    for (let pass = 0; pass < 5; pass++) {
      const next = decodeURIComponent(decoded);
      if (next === decoded) {
        return !hasUnsafePathShape(decoded);
      }
      decoded = next;
      if (hasUnsafePathShape(decoded)) {
        return false;
      }
    }
    // Do not accept values that remain recursively encoded after the cap.
    return decodeURIComponent(decoded) === decoded && !hasUnsafePathShape(decoded);
  }
  catch (error) {
    return false;
  }
};

const indexTooltipImages = definitions => {
  const counts = Object.create(null);
  const indexed = Object.create(null);
  if (!Array.isArray(definitions)) {
    return indexed;
  }

  definitions.forEach(definition => {
    if (definition && typeof definition.id === 'string' && UUID_V4.test(definition.id)) {
      counts[definition.id] = (counts[definition.id] || 0) + 1;
    }
  });

  definitions.forEach(definition => {
    if (!definition || typeof definition.id !== 'string' ||
        !UUID_V4.test(definition.id) || counts[definition.id] !== 1 ||
        !definition.image || !isManagedImagePath(definition.image.path) ||
        typeof definition.alt !== 'string' || definition.alt.trim() === '') {
      return;
    }
    indexed[definition.id] = {
      alt: definition.alt.trim(),
      image: definition.image,
      path: definition.image.path
    };
  });

  return indexed;
};

const resolveTooltipImage = (definition, contentId, getPath) => {
  if (!definition || typeof getPath !== 'function') {
    return null;
  }
  try {
    const src = getPath(definition.path, contentId);
    return typeof src === 'string' && src !== '' ? {
      alt: definition.alt,
      src
    } : null;
  }
  catch (error) {
    return null;
  }
};

export { indexTooltipImages, isManagedImagePath, resolveTooltipImage };
