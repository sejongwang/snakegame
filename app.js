(function () {
  "use strict";

  const ALPHABET = "abcdefghijklmnopqrstuvwxyz".split("");
  const assets = Array.isArray(window.LETTER_ASSETS) ? window.LETTER_ASSETS : [];
  const assetMap = new Map();
  const canvas = document.getElementById("letterCanvas");
  const ctx = canvas.getContext("2d");
  const ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4];

  const refs = {
    textInput: document.getElementById("textInput"),
    glyphGrid: document.getElementById("glyphGrid"),
    assetCount: document.getElementById("assetCount"),
    selectionPanel: document.getElementById("selectionPanel"),
    selectedPreview: document.getElementById("selectedPreview"),
    selectedInfo: document.getElementById("selectedInfo"),
    selectedScale: document.getElementById("selectedScale"),
    selectedScaleValue: document.getElementById("selectedScaleValue"),
    resetSelectedScale: document.getElementById("resetSelectedScale"),
    fontSize: document.getElementById("fontSize"),
    fontSizeValue: document.getElementById("fontSizeValue"),
    letterSpacing: document.getElementById("letterSpacing"),
    letterSpacingValue: document.getElementById("letterSpacingValue"),
    wordSpacing: document.getElementById("wordSpacing"),
    wordSpacingValue: document.getElementById("wordSpacingValue"),
    lineHeight: document.getElementById("lineHeight"),
    lineHeightValue: document.getElementById("lineHeightValue"),
    padding: document.getElementById("padding"),
    paddingValue: document.getElementById("paddingValue"),
    autoGrow: document.getElementById("autoGrow"),
    autoFit: document.getElementById("autoFit"),
    autoWrap: document.getElementById("autoWrap"),
    trimTransparent: document.getElementById("trimTransparent"),
    drawBackground: document.getElementById("drawBackground"),
    backgroundColor: document.getElementById("backgroundColor"),
    canvasWidth: document.getElementById("canvasWidth"),
    canvasHeight: document.getElementById("canvasHeight"),
    exportScale: document.getElementById("exportScale"),
    previewZoom: document.getElementById("previewZoom"),
    zoomOut: document.getElementById("zoomOut"),
    zoomIn: document.getElementById("zoomIn"),
    exportPng: document.getElementById("exportPng"),
    clearText: document.getElementById("clearText"),
    statusText: document.getElementById("statusText"),
    sizeReadout: document.getElementById("sizeReadout"),
    canvasStage: document.getElementById("canvasStage")
  };

  const state = {
    align: "center",
    verticalAlign: "middle",
    previewZoom: "fit",
    selectedIndex: null,
    selectedIndices: new Set(),
    caretIndex: null,
    charScales: [],
    hitBoxes: [],
    dragSelection: null,
    suppressNextClick: false,
    lastSettings: null,
    ready: false,
    images: new Map(),
    trimBoxes: new Map()
  };

  function normalizeKey(char) {
    const lower = char.toLowerCase();
    if (lower >= "a" && lower <= "z") {
      return lower;
    }
    return char;
  }

  function getSettings() {
    const width = clamp(parseInt(refs.canvasWidth.value, 10) || 1200, 240, 4000);
    const height = clamp(parseInt(refs.canvasHeight.value, 10) || 720, 240, 4000);
    const autoGrow = refs.autoGrow.checked;

    return {
      text: refs.textInput.value,
      baseWidth: width,
      baseHeight: height,
      width,
      height,
      requestedFontSize: parseInt(refs.fontSize.value, 10) || 150,
      letterSpacingRatio: (parseInt(refs.letterSpacing.value, 10) || 0) / 100,
      wordSpacingRatio: (parseInt(refs.wordSpacing.value, 10) || 42) / 100,
      lineHeightRatio: (parseInt(refs.lineHeight.value, 10) || 108) / 100,
      padding: clamp(parseInt(refs.padding.value, 10) || 0, 0, 220),
      autoGrow,
      autoFit: refs.autoFit.checked && !autoGrow,
      autoWrap: refs.autoWrap.checked,
      trimTransparent: refs.trimTransparent.checked,
      drawBackground: refs.drawBackground.checked,
      backgroundColor: refs.backgroundColor.value,
      align: state.align,
      verticalAlign: state.verticalAlign
    };
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function loadImage(asset) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve({ asset, image });
      image.onerror = () => reject(new Error(`Failed to load ${asset.file}`));
      image.src = asset.file;
    });
  }

  async function boot() {
    assets.forEach((asset) => assetMap.set(asset.key, asset));
    refs.assetCount.textContent = String(ALPHABET.filter((letter) => assetMap.has(letter)).length);
    buildGlyphGrid();

    const loaded = await Promise.all(assets.map(loadImage));
    loaded.forEach(({ asset, image }) => {
      state.images.set(asset.key, image);
      state.trimBoxes.set(asset.key, calculateTrimBox(image));
    });

    state.ready = true;
    bindEvents();
    render();
  }

  function buildGlyphGrid() {
    const fragment = document.createDocumentFragment();
    const keys = [...ALPHABET, "'"].filter((key) => assetMap.has(key));

    keys.forEach((key) => {
      const asset = assetMap.get(key);
      const button = document.createElement("button");
      const img = document.createElement("img");
      button.className = "glyph-button";
      button.type = "button";
      button.dataset.insert = key;
      button.title = asset.source;
      img.alt = asset.source;
      img.src = asset.file;
      button.appendChild(img);
      fragment.appendChild(button);
    });

    refs.glyphGrid.replaceChildren(fragment);
  }

  function bindEvents() {
    [
      refs.fontSize,
      refs.letterSpacing,
      refs.wordSpacing,
      refs.lineHeight,
      refs.padding,
      refs.autoGrow,
      refs.autoFit,
      refs.autoWrap,
      refs.trimTransparent,
      refs.drawBackground,
      refs.backgroundColor,
      refs.canvasWidth,
      refs.canvasHeight,
      refs.exportScale,
      refs.previewZoom
    ].forEach((element) => {
      element.addEventListener("input", render);
      element.addEventListener("change", render);
    });

    refs.textInput.addEventListener("input", () => {
      syncCharacterScales();
      state.caretIndex = getTextInputCaretIndex();
      if (!isSelectableIndex(state.selectedIndex)) {
        state.selectedIndex = null;
      }
      pruneSelectedIndices();
      render();
    });

    refs.textInput.addEventListener("click", () => {
      state.caretIndex = getTextInputCaretIndex();
    });

    refs.textInput.addEventListener("keyup", () => {
      state.caretIndex = getTextInputCaretIndex();
    });

    refs.selectedScale.addEventListener("input", () => {
      const selected = getSelectedIndices();
      if (!selected.length) return;
      const scale = parseInt(refs.selectedScale.value, 10) / 100;
      selected.forEach((index) => {
        state.charScales[index] = scale;
      });
      render();
    });

    refs.resetSelectedScale.addEventListener("click", () => {
      const selected = getSelectedIndices();
      if (!selected.length) return;
      selected.forEach((index) => {
        state.charScales[index] = 1;
      });
      render();
    });

    refs.previewZoom.addEventListener("change", () => {
      state.previewZoom = refs.previewZoom.value === "fit" ? "fit" : parseFloat(refs.previewZoom.value);
      render();
    });

    refs.zoomOut.addEventListener("click", () => stepPreviewZoom(-1));
    refs.zoomIn.addEventListener("click", () => stepPreviewZoom(1));

    document.querySelectorAll("[data-align]").forEach((button) => {
      button.addEventListener("click", () => {
        state.align = button.dataset.align;
        updateSegment("[data-align]", state.align, "align");
        render();
      });
    });

    document.querySelectorAll("[data-valign]").forEach((button) => {
      button.addEventListener("click", () => {
        state.verticalAlign = button.dataset.valign;
        updateSegment("[data-valign]", state.verticalAlign, "valign");
        render();
      });
    });

    refs.glyphGrid.addEventListener("click", (event) => {
      const button = event.target.closest("[data-insert]");
      if (!button) return;
      insertTextAtCaret(button.dataset.insert);
      render();
    });

    refs.clearText.addEventListener("click", () => {
      refs.textInput.value = "";
      state.charScales = [];
      state.selectedIndex = null;
      state.selectedIndices.clear();
      state.caretIndex = 0;
      refs.textInput.focus();
      render();
    });

    refs.canvasStage.addEventListener("click", handleCanvasClick);
    refs.canvasStage.addEventListener("pointerdown", handleCanvasPointerDown);
    refs.canvasStage.addEventListener("pointermove", handleCanvasPointerMove);
    refs.canvasStage.addEventListener("pointerup", handleCanvasPointerUp);
    refs.canvasStage.addEventListener("pointercancel", cancelCanvasDrag);
    refs.canvasStage.addEventListener("keydown", handleCanvasKeydown);

    refs.exportPng.addEventListener("click", exportPng);

    refs.autoGrow.addEventListener("change", () => {
      if (refs.autoGrow.checked) {
        refs.autoFit.checked = false;
      }
      render();
    });

    refs.autoFit.addEventListener("change", () => {
      if (refs.autoFit.checked) {
        refs.autoGrow.checked = false;
      }
      render();
    });

    const resizeObserver = new ResizeObserver(() => {
      if (state.ready && state.previewZoom === "fit") {
        render();
      }
    });
    resizeObserver.observe(refs.canvasStage);

    syncCharacterScales();
    state.caretIndex = getCharacterCount();
  }

  function updateSegment(selector, value, attrName) {
    document.querySelectorAll(selector).forEach((button) => {
      button.classList.toggle("is-active", button.dataset[attrName] === value);
    });
  }

  function render() {
    if (!state.ready) return;

    const settings = resolveCanvasSize(getSettings());
    const displayZoom = getDisplayZoom(settings);
    const previewScale = getPreviewRenderScale(settings, displayZoom);
    const displayWidth = Math.max(1, Math.round(settings.width * displayZoom));
    const displayHeight = Math.max(1, Math.round(settings.height * displayZoom));

    refs.fontSizeValue.textContent = String(settings.requestedFontSize);
    refs.letterSpacingValue.textContent = `${Math.round(settings.letterSpacingRatio * 100)}%`;
    refs.wordSpacingValue.textContent = `${Math.round(settings.wordSpacingRatio * 100)}%`;
    refs.lineHeightValue.textContent = `${Math.round(settings.lineHeightRatio * 100)}%`;
    refs.paddingValue.textContent = String(settings.padding);
    refs.sizeReadout.textContent = `${settings.width} x ${settings.height} · ${Math.round(displayZoom * 100)}%`;

    canvas.width = Math.round(settings.width * previewScale);
    canvas.height = Math.round(settings.height * previewScale);
    canvas.style.width = `${displayWidth}px`;
    canvas.style.height = `${displayHeight}px`;
    canvas.style.aspectRatio = `${settings.width} / ${settings.height}`;
    updateCanvasStageOverflow(displayWidth, displayHeight);

    state.lastSettings = settings;
    drawToCanvas(ctx, settings, previewScale, { showSelection: true, trackHits: true });
    updateSelectionControls();
  }

  function drawToCanvas(targetCtx, settings, scale, options = {}) {
    const layout = createLayout(settings);
    const width = settings.width * scale;
    const height = settings.height * scale;
    const hitBoxes = [];

    targetCtx.clearRect(0, 0, width, height);
    targetCtx.imageSmoothingEnabled = true;
    targetCtx.imageSmoothingQuality = "high";

    if (settings.drawBackground) {
      targetCtx.fillStyle = settings.backgroundColor;
      targetCtx.fillRect(0, 0, width, height);
    }

    layout.lines.forEach((line) => {
      let x = line.x;
      line.items.forEach((item) => {
        if (item.kind !== "glyph") {
          x += item.advance;
          return;
        }
        const image = state.images.get(item.key);
        if (!image) return;
        const drawY = line.y + (line.height - item.height) / 2;
        const box = {
          index: item.index,
          key: item.key,
          x,
          y: drawY,
          width: item.width,
          height: item.height
        };
        hitBoxes.push(box);

        drawGlyphImage(targetCtx, image, item, x, drawY, settings.trimTransparent, scale);

        if (options.showSelection && isSelectedIndex(item.index)) {
          drawSelection(targetCtx, box, scale);
        }

        x += item.advance;
      });
    });

    if (options.showSelection && document.activeElement === refs.canvasStage && !isSelectableIndex(state.selectedIndex)) {
      drawCaret(targetCtx, layout, scale);
    }

    if (options.showSelection && state.dragSelection?.dragging) {
      drawDragSelection(targetCtx, state.dragSelection, scale);
    }

    if (options.trackHits) {
      state.hitBoxes = hitBoxes;
    }
    updateStatus(layout, settings);
  }

  function updateStatus(layout, settings) {
    const unsupported = [...layout.unsupported].sort();
    const size = Math.round(layout.fontSize);

    refs.statusText.classList.toggle("has-warning", unsupported.length > 0);
    if (unsupported.length) {
      refs.statusText.textContent = `Excluded: ${unsupported.join(" ")}`;
      return;
    }

    if (settings.autoGrow) {
      const didGrow = settings.width > settings.baseWidth || settings.height > settings.baseHeight;
      refs.statusText.textContent = `${didGrow ? "Grown" : "Size"} ${size}`;
      return;
    }

    refs.statusText.textContent = `Size ${size}`;
  }

  function drawGlyphImage(targetCtx, image, item, x, y, trimTransparent, scale) {
    const sourceBox = trimTransparent ? state.trimBoxes.get(item.key) : null;
    const dest = {
      x: x * scale,
      y: y * scale,
      width: item.width * scale,
      height: item.height * scale
    };

    if (sourceBox) {
      targetCtx.drawImage(
        image,
        sourceBox.x,
        sourceBox.y,
        sourceBox.width,
        sourceBox.height,
        dest.x,
        dest.y,
        dest.width,
        dest.height
      );
      return;
    }

    targetCtx.drawImage(
      image,
      dest.x,
      dest.y,
      dest.width,
      dest.height
    );
  }

  function drawSelection(targetCtx, box, scale) {
    const x = Math.round(box.x * scale) - 5;
    const y = Math.round(box.y * scale) - 5;
    const width = Math.round(box.width * scale) + 10;
    const height = Math.round(box.height * scale) + 10;

    targetCtx.save();
    targetCtx.strokeStyle = "#2f6f63";
    targetCtx.lineWidth = Math.max(2, 2 * scale);
    targetCtx.setLineDash([Math.max(7, 7 * scale), Math.max(5, 5 * scale)]);
    targetCtx.strokeRect(x, y, width, height);
    targetCtx.restore();
  }

  function drawDragSelection(targetCtx, selection, scale) {
    const rect = normalizeRect(selection.startX, selection.startY, selection.currentX, selection.currentY);

    targetCtx.save();
    targetCtx.fillStyle = "rgba(47, 111, 99, 0.12)";
    targetCtx.strokeStyle = "#2f6f63";
    targetCtx.lineWidth = Math.max(1.5, 1.5 * scale);
    targetCtx.setLineDash([Math.max(6, 6 * scale), Math.max(4, 4 * scale)]);
    targetCtx.fillRect(rect.x * scale, rect.y * scale, rect.width * scale, rect.height * scale);
    targetCtx.strokeRect(rect.x * scale, rect.y * scale, rect.width * scale, rect.height * scale);
    targetCtx.restore();
  }

  function drawCaret(targetCtx, layout, scale) {
    const box = getCaretBox(layout);
    if (!box) return;

    targetCtx.save();
    targetCtx.strokeStyle = "#2f6f63";
    targetCtx.lineWidth = Math.max(2, 2 * scale);
    targetCtx.beginPath();
    targetCtx.moveTo(box.x * scale, box.y * scale);
    targetCtx.lineTo(box.x * scale, (box.y + box.height) * scale);
    targetCtx.stroke();
    targetCtx.restore();
  }

  function getCaretBox(layout) {
    const index = clamp(state.caretIndex ?? getCharacterCount(), 0, getCharacterCount());
    let fallback = null;

    for (const line of layout.lines) {
      let x = line.x;
      if (!line.items.length) {
        fallback = { x, y: line.y, height: line.height };
        continue;
      }

      for (const item of line.items) {
        if (index <= item.index) {
          return { x, y: line.y, height: line.height };
        }

        x += item.advance;
        if (index === item.index + 1) {
          return { x, y: line.y, height: line.height };
        }
      }

      fallback = { x, y: line.y, height: line.height };
    }

    return fallback;
  }

  function createLayout(settings) {
    const fontSize = settings.autoFit ? findBestFontSize(settings) : settings.requestedFontSize;
    return measureLayout(settings, fontSize, true);
  }

  function findBestFontSize(settings) {
    let low = 8;
    let high = settings.requestedFontSize;
    let best = low;

    for (let i = 0; i < 18; i += 1) {
      const mid = (low + high) / 2;
      const layout = measureLayout(settings, mid, false);
      if (layout.fits) {
        best = mid;
        low = mid;
      } else {
        high = mid;
      }
    }

    return best;
  }

  function resolveCanvasSize(settings) {
    if (!settings.autoGrow) {
      return settings;
    }

    const measuringSettings = {
      ...settings,
      width: settings.baseWidth,
      height: settings.baseHeight,
      autoFit: false
    };
    const layout = measureLayout(measuringSettings, settings.requestedFontSize, false);
    const width = Math.max(settings.baseWidth, Math.ceil(layout.maxLineWidth + settings.padding * 2));
    const height = Math.max(settings.baseHeight, Math.ceil(layout.totalHeight + settings.padding * 2));

    return {
      ...settings,
      width: clampCanvasEdge(width),
      height: clampCanvasEdge(height),
      autoFit: false
    };
  }

  function clampCanvasEdge(value) {
    return clamp(value, 1, 12000);
  }

  function getPreviewScale() {
    return clamp(window.devicePixelRatio || 1, 1, 3);
  }

  function getDisplayZoom(settings) {
    if (state.previewZoom !== "fit") {
      return state.previewZoom;
    }

    const style = window.getComputedStyle(refs.canvasStage);
    const paddingX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
    const paddingY = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    const availableWidth = Math.max(1, refs.canvasStage.clientWidth - paddingX - 2);
    const availableHeight = Math.max(1, refs.canvasStage.clientHeight - paddingY - 2);
    const fitZoom = Math.min(availableWidth / settings.width, availableHeight / settings.height, 1);
    return clamp(fitZoom, 0.05, 1);
  }

  function getPreviewRenderScale(settings, displayZoom) {
    const preferredScale = getPreviewScale() * displayZoom;
    const maxPreviewPixels = 32000000;
    const pixelCount = settings.width * settings.height * preferredScale * preferredScale;

    if (pixelCount <= maxPreviewPixels) {
      return preferredScale;
    }

    return Math.max(0.05, Math.sqrt(maxPreviewPixels / (settings.width * settings.height)));
  }

  function updateCanvasStageOverflow(displayWidth, displayHeight) {
    const style = window.getComputedStyle(refs.canvasStage);
    const paddingX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
    const paddingY = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    const availableWidth = Math.max(1, refs.canvasStage.clientWidth - paddingX - 2);
    const availableHeight = Math.max(1, refs.canvasStage.clientHeight - paddingY - 2);
    refs.canvasStage.classList.toggle(
      "is-scrollable",
      displayWidth > availableWidth || displayHeight > availableHeight
    );
  }

  function stepPreviewZoom(direction) {
    const current = state.previewZoom === "fit" ? getDisplayZoom(resolveCanvasSize(getSettings())) : state.previewZoom;
    let index = ZOOM_STEPS.findIndex((step) => step >= current - 0.001);

    if (index === -1) {
      index = ZOOM_STEPS.length - 1;
    }

    if (direction > 0 && ZOOM_STEPS[index] <= current + 0.001) {
      index += 1;
    } else if (direction < 0 && ZOOM_STEPS[index] >= current - 0.001) {
      index -= 1;
    }

    const next = ZOOM_STEPS[clamp(index, 0, ZOOM_STEPS.length - 1)];
    state.previewZoom = next;
    refs.previewZoom.value = String(next);
    render();
  }

  function measureLayout(settings, fontSize, includePositions) {
    const contentWidth = Math.max(1, settings.width - settings.padding * 2);
    const contentHeight = Math.max(1, settings.height - settings.padding * 2);
    const lineGap = fontSize * Math.max(0, settings.lineHeightRatio - 1);
    const unsupported = new Set();
    const lines = [];
    const paragraphs = settings.text.replace(/\r\n/g, "\n").split("\n");
    let characterOffset = 0;

    paragraphs.forEach((paragraph) => {
      const lineItems = createWrappedLines(paragraph, settings, fontSize, contentWidth, unsupported, characterOffset);
      lines.push(...lineItems);
      characterOffset += [...paragraph].length + 1;
    });

    if (lines.length === 0) {
      lines.push({ items: [], width: 0 });
    }

    const totalHeight = lines.length === 0
      ? 0
      : lines.reduce((sum, line) => sum + line.height, 0) + lineGap * (lines.length - 1);
    const maxLineWidth = lines.reduce((max, line) => Math.max(max, line.width), 0);
    const fits = maxLineWidth <= contentWidth + 0.5 && totalHeight <= contentHeight + 0.5;

    if (includePositions) {
      const startY = getStartY(settings, totalHeight);
      let y = startY;
      lines.forEach((line, lineIndex) => {
        line.x = getStartX(settings, line.width);
        line.y = y;
        y += line.height + (lineIndex === lines.length - 1 ? 0 : lineGap);
      });
    }

    return {
      lines,
      fontSize,
      totalHeight,
      maxLineWidth,
      unsupported,
      fits
    };
  }

  function createWrappedLines(text, settings, fontSize, contentWidth, unsupported, characterOffset) {
    const tokens = textToItems(text, settings, fontSize, unsupported, characterOffset);
    const lines = [];
    let current = [];
    let currentWidth = 0;

    tokens.forEach((item) => {
      if (item.kind === "unsupported") return;

      if (settings.autoWrap && current.length > 0 && currentWidth + item.advance > contentWidth) {
        trimTrailingSpaces(current);
        lines.push(makeLine(current, fontSize));
        current = [];
        currentWidth = 0;
        if (item.kind === "space") return;
      }

      current.push(item);
      currentWidth += item.advance;
    });

    trimTrailingSpaces(current);
    lines.push(makeLine(current, fontSize));
    return lines;
  }

  function textToItems(text, settings, fontSize, unsupported, characterOffset) {
    const items = [];
    const letterSpacing = fontSize * settings.letterSpacingRatio;

    [...text].forEach((char, index) => {
      const characterIndex = characterOffset + index;
      if (char === " " || char === "\t") {
        const width = fontSize * settings.wordSpacingRatio * (char === "\t" ? 2 : 1);
        items.push({ kind: "space", index: characterIndex, width, height: fontSize, advance: width + letterSpacing });
        return;
      }

      const key = normalizeKey(char);
      const image = state.images.get(key);
      if (!image) {
        unsupported.add(char);
        items.push({ kind: "unsupported", index: characterIndex, width: 0, height: fontSize, advance: 0 });
        return;
      }

      const ratio = getImageRatio(key, image, settings.trimTransparent);
      const height = fontSize * getCharacterScale(characterIndex);
      const width = height * ratio;
      items.push({
        kind: "glyph",
        index: characterIndex,
        key,
        source: assetMap.get(key).source,
        width,
        height,
        advance: width + letterSpacing
      });
    });

    if (items.length > 0) {
      items[items.length - 1].advance = items[items.length - 1].width;
    }

    return items;
  }

  function makeLine(items, fallbackHeight) {
    return {
      items,
      width: lineWidth(items),
      height: lineHeight(items, fallbackHeight)
    };
  }

  function trimTrailingSpaces(items) {
    while (items.length && items[items.length - 1].kind === "space") {
      items.pop();
    }
    if (items.length) {
      items[items.length - 1].advance = items[items.length - 1].width;
    }
  }

  function lineWidth(items) {
    return items.reduce((sum, item) => sum + item.advance, 0);
  }

  function lineHeight(items, fallbackHeight) {
    return items.reduce((max, item) => Math.max(max, item.height || fallbackHeight), fallbackHeight);
  }

  function getCharacterScale(index) {
    const scale = state.charScales[index];
    return typeof scale === "number" && Number.isFinite(scale) ? clamp(scale, 0.25, 3) : 1;
  }

  function getCharacters() {
    return [...refs.textInput.value];
  }

  function getCharacterCount() {
    return getCharacters().length;
  }

  function syncCharacterScales() {
    const length = getCharacterCount();
    while (state.charScales.length < length) {
      state.charScales.push(1);
    }
    if (state.charScales.length > length) {
      state.charScales.length = length;
    }
  }

  function getTextInputCaretIndex() {
    return [...refs.textInput.value.slice(0, refs.textInput.selectionStart || 0)].length;
  }

  function setTextInputCaretFromCharacterIndex(index) {
    const chars = getCharacters();
    const offset = chars.slice(0, clamp(index, 0, chars.length)).join("").length;
    refs.textInput.selectionStart = offset;
    refs.textInput.selectionEnd = offset;
  }

  function isSelectableIndex(index) {
    if (index === null || index === undefined) return false;
    const chars = getCharacters();
    if (index < 0 || index >= chars.length) return false;
    return state.images.has(normalizeKey(chars[index]));
  }

  function isSelectedIndex(index) {
    return state.selectedIndices.has(index) || state.selectedIndex === index;
  }

  function getSelectedIndices() {
    const selected = new Set(state.selectedIndices);
    if (isSelectableIndex(state.selectedIndex)) {
      selected.add(state.selectedIndex);
    }
    return [...selected].filter(isSelectableIndex).sort((a, b) => a - b);
  }

  function setSelectedIndices(indices) {
    const valid = indices.filter(isSelectableIndex).sort((a, b) => a - b);
    state.selectedIndices = new Set(valid);
    state.selectedIndex = valid.length ? valid[0] : null;
    state.caretIndex = valid.length ? valid[valid.length - 1] + 1 : state.caretIndex;
  }

  function clearSelection() {
    state.selectedIndex = null;
    state.selectedIndices.clear();
  }

  function pruneSelectedIndices() {
    setSelectedIndices(getSelectedIndices());
  }

  function updateSelectionControls() {
    const selected = getSelectedIndices();
    const isSelected = selected.length > 0;
    refs.selectionPanel.classList.toggle("is-disabled", !isSelected);
    refs.selectedScale.disabled = !isSelected;
    refs.resetSelectedScale.disabled = !isSelected;

    if (!isSelected) {
      refs.selectedPreview.textContent = "-";
      refs.selectedInfo.textContent = "None";
      refs.selectedScale.value = "100";
      refs.selectedScaleValue.textContent = "100%";
      return;
    }

    const primaryIndex = selected[0];
    const char = getCharacters()[primaryIndex];
    const key = normalizeKey(char);
    const asset = assetMap.get(key);
    const averageScale = selected.reduce((sum, index) => sum + getCharacterScale(index), 0) / selected.length;
    const scale = Math.round(averageScale * 100);
    const img = document.createElement("img");

    if (selected.length === 1) {
      img.src = asset.file;
      img.alt = asset.source;
      refs.selectedPreview.replaceChildren(img);
      refs.selectedInfo.textContent = `${asset.source} · #${primaryIndex + 1}`;
    } else {
      refs.selectedPreview.textContent = String(selected.length);
      refs.selectedInfo.textContent = `${selected.length} letters`;
    }

    refs.selectedScale.value = String(scale);
    refs.selectedScaleValue.textContent = `${scale}%`;
  }

  function handleCanvasClick(event) {
    if (state.suppressNextClick) {
      state.suppressNextClick = false;
      return;
    }

    refs.canvasStage.focus({ preventScroll: true });

    const settings = state.lastSettings;
    if (!settings) return;

    const rect = canvas.getBoundingClientRect();
    const insideCanvas = event.clientX >= rect.left
      && event.clientX <= rect.right
      && event.clientY >= rect.top
      && event.clientY <= rect.bottom;

    if (!insideCanvas) {
      clearSelection();
      state.caretIndex = getCharacterCount();
      setTextInputCaretFromCharacterIndex(state.caretIndex);
      render();
      return;
    }

    const x = ((event.clientX - rect.left) / rect.width) * settings.width;
    const y = ((event.clientY - rect.top) / rect.height) * settings.height;
    const hit = [...state.hitBoxes].reverse().find((box) => (
      x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height
    ));

    if (hit) {
      setSelectedIndices([hit.index]);
      state.caretIndex = hit.index + 1;
    } else {
      clearSelection();
      state.caretIndex = findNearestCaretIndex(x, y);
    }

    setTextInputCaretFromCharacterIndex(state.caretIndex);
    render();
  }

  function handleCanvasPointerDown(event) {
    if (event.button !== 0) return;
    refs.canvasStage.focus({ preventScroll: true });

    const point = getCanvasPoint(event);
    if (!point) {
      clearSelection();
      state.caretIndex = getCharacterCount();
      render();
      return;
    }

    state.dragSelection = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: point.x,
      startY: point.y,
      currentX: point.x,
      currentY: point.y,
      dragging: false
    };

    refs.canvasStage.setPointerCapture?.(event.pointerId);
  }

  function handleCanvasPointerMove(event) {
    const drag = state.dragSelection;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const point = getCanvasPoint(event);
    if (!point) return;

    drag.currentX = point.x;
    drag.currentY = point.y;

    const moved = Math.hypot(event.clientX - drag.startClientX, event.clientY - drag.startClientY);
    if (moved < 4 && !drag.dragging) return;

    drag.dragging = true;
    selectBoxesInRect(normalizeRect(drag.startX, drag.startY, drag.currentX, drag.currentY));
    state.suppressNextClick = true;
    event.preventDefault();
    render();
  }

  function handleCanvasPointerUp(event) {
    const drag = state.dragSelection;
    if (!drag || drag.pointerId !== event.pointerId) return;

    refs.canvasStage.releasePointerCapture?.(event.pointerId);

    if (drag.dragging) {
      selectBoxesInRect(normalizeRect(drag.startX, drag.startY, drag.currentX, drag.currentY));
      state.suppressNextClick = true;
      state.dragSelection = null;
      setTextInputCaretFromCharacterIndex(state.caretIndex ?? getCharacterCount());
      event.preventDefault();
      render();
      return;
    }

    state.dragSelection = null;
  }

  function cancelCanvasDrag(event) {
    if (state.dragSelection?.pointerId === event.pointerId) {
      state.dragSelection = null;
      render();
    }
  }

  function getCanvasPoint(event) {
    const settings = state.lastSettings;
    if (!settings) return null;

    const rect = canvas.getBoundingClientRect();
    const insideCanvas = event.clientX >= rect.left
      && event.clientX <= rect.right
      && event.clientY >= rect.top
      && event.clientY <= rect.bottom;

    if (!insideCanvas) return null;

    return {
      x: ((event.clientX - rect.left) / rect.width) * settings.width,
      y: ((event.clientY - rect.top) / rect.height) * settings.height
    };
  }

  function normalizeRect(startX, startY, endX, endY) {
    const x = Math.min(startX, endX);
    const y = Math.min(startY, endY);
    return {
      x,
      y,
      width: Math.abs(endX - startX),
      height: Math.abs(endY - startY)
    };
  }

  function selectBoxesInRect(rect) {
    const selected = state.hitBoxes
      .filter((box) => rectsIntersect(rect, box))
      .map((box) => box.index);

    setSelectedIndices(selected);
  }

  function rectsIntersect(a, b) {
    return a.x <= b.x + b.width
      && a.x + a.width >= b.x
      && a.y <= b.y + b.height
      && a.y + a.height >= b.y;
  }

  function findNearestCaretIndex(x, y) {
    if (!state.hitBoxes.length) {
      return getCharacterCount();
    }

    let nearest = state.hitBoxes[0];
    let nearestDistance = Infinity;

    state.hitBoxes.forEach((box) => {
      const centerX = box.x + box.width / 2;
      const centerY = box.y + box.height / 2;
      const distance = Math.hypot(centerX - x, centerY - y);
      if (distance < nearestDistance) {
        nearest = box;
        nearestDistance = distance;
      }
    });

    return x < nearest.x + nearest.width / 2 ? nearest.index : nearest.index + 1;
  }

  function handleCanvasKeydown(event) {
    if (event.metaKey || event.ctrlKey || event.altKey) return;

    if (event.key === "Backspace") {
      event.preventDefault();
      if (getSelectedIndices().length) {
        removeSelectedCharacters();
      } else if ((state.caretIndex || 0) > 0) {
        removeCharacterAt((state.caretIndex || 0) - 1);
      }
      return;
    }

    if (event.key === "Delete") {
      event.preventDefault();
      if (getSelectedIndices().length) {
        removeSelectedCharacters();
      } else {
        removeCharacterAt(state.caretIndex || 0);
      }
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      insertTextAtCaret("\n");
      return;
    }

    if (event.key === "Tab") {
      event.preventDefault();
      insertTextAtCaret("\t");
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      clearSelection();
      render();
      return;
    }

    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      moveCaret(event.key === "ArrowLeft" ? -1 : 1);
      return;
    }

    if (event.key.length === 1) {
      event.preventDefault();
      insertTextAtCaret(event.key);
    }
  }

  function insertTextAtCaret(value) {
    const chars = getCharacters();
    const insertChars = [...value];
    const selected = getSelectedIndices();
    let index = clamp(state.caretIndex ?? chars.length, 0, chars.length);

    if (selected.length) {
      index = selected[0];
      removeIndicesFromText(selected);
    }

    const nextChars = getCharacters();
    nextChars.splice(index, 0, ...insertChars);
    state.charScales.splice(index, 0, ...insertChars.map(() => 1));
    refs.textInput.value = nextChars.join("");
    state.caretIndex = index + insertChars.length;
    clearSelection();
    if (insertChars.length === 1 && state.images.has(normalizeKey(insertChars[0]))) {
      setSelectedIndices([index]);
    }
    setTextInputCaretFromCharacterIndex(state.caretIndex);
    render();
  }

  function removeCharacterAt(index) {
    const chars = getCharacters();
    if (index < 0 || index >= chars.length) return;

    chars.splice(index, 1);
    state.charScales.splice(index, 1);
    refs.textInput.value = chars.join("");
    state.caretIndex = clamp(index, 0, chars.length);
    clearSelection();
    setTextInputCaretFromCharacterIndex(state.caretIndex);
    render();
  }

  function removeSelectedCharacters() {
    const selected = getSelectedIndices();
    if (!selected.length) return;

    const nextCaret = selected[0];
    removeIndicesFromText(selected);
    state.caretIndex = nextCaret;
    clearSelection();
    setTextInputCaretFromCharacterIndex(state.caretIndex);
    render();
  }

  function removeIndicesFromText(indices) {
    const chars = getCharacters();
    [...indices].sort((a, b) => b - a).forEach((index) => {
      if (index < 0 || index >= chars.length) return;
      chars.splice(index, 1);
      state.charScales.splice(index, 1);
    });
    refs.textInput.value = chars.join("");
  }

  function moveCaret(direction) {
    const chars = getCharacters();
    state.caretIndex = clamp((state.caretIndex ?? chars.length) + direction, 0, chars.length);
    clearSelection();
    setTextInputCaretFromCharacterIndex(state.caretIndex);
    render();
  }

  function getImageRatio(key, image, trimTransparent) {
    if (!trimTransparent) {
      return image.naturalWidth / image.naturalHeight;
    }
    const box = state.trimBoxes.get(key);
    return box.width / box.height;
  }

  function getStartX(settings, lineWidthValue) {
    const contentWidth = Math.max(1, settings.width - settings.padding * 2);
    if (settings.align === "left") return settings.padding;
    if (settings.align === "right") return settings.padding + contentWidth - lineWidthValue;
    return settings.padding + (contentWidth - lineWidthValue) / 2;
  }

  function getStartY(settings, totalHeight) {
    const contentHeight = Math.max(1, settings.height - settings.padding * 2);
    if (settings.verticalAlign === "top") return settings.padding;
    if (settings.verticalAlign === "bottom") return settings.padding + contentHeight - totalHeight;
    return settings.padding + (contentHeight - totalHeight) / 2;
  }

  function calculateTrimBox(image) {
    const scratch = document.createElement("canvas");
    const scratchCtx = scratch.getContext("2d", { willReadFrequently: true });
    scratch.width = image.naturalWidth;
    scratch.height = image.naturalHeight;
    scratchCtx.drawImage(image, 0, 0);

    const { data, width, height } = scratchCtx.getImageData(0, 0, scratch.width, scratch.height);
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const alpha = data[(y * width + x) * 4 + 3];
        if (alpha > 0) {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
    }

    if (maxX < minX || maxY < minY) {
      return { x: 0, y: 0, width, height };
    }

    return {
      x: minX,
      y: minY,
      width: maxX - minX + 1,
      height: maxY - minY + 1
    };
  }

  function exportPng() {
    const settings = resolveCanvasSize(getSettings());
    const scale = parseInt(refs.exportScale.value, 10) || 1;
    const exportCanvas = document.createElement("canvas");
    const exportCtx = exportCanvas.getContext("2d");
    exportCanvas.width = settings.width * scale;
    exportCanvas.height = settings.height * scale;
    drawToCanvas(exportCtx, settings, scale);

    exportCanvas.toBlob((blob) => {
      if (!blob) return;
      const link = document.createElement("a");
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      link.href = URL.createObjectURL(blob);
      link.download = `png-letter-text-${timestamp}.png`;
      link.click();
      URL.revokeObjectURL(link.href);
      render();
    }, "image/png");
  }

  boot().catch((error) => {
    refs.statusText.classList.add("has-warning");
    refs.statusText.textContent = error.message;
  });
})();
