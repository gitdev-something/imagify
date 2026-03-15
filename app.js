/**
 * Imagify — Pixel Preset Studio
 * app.js — all application logic
 */

'use strict';

// ── CONSTANTS ───────────────────────────────────────────────────
const STORAGE_KEY = 'imagify_presets';
const WORK_SIZE   = 512; // internal canvas resolution for processing

// ── STATE ────────────────────────────────────────────────────────
let presets          = [];   // [{ id, name, createdAt, thumbnail, pixelMap }]
let selectedPreset   = null; // preset object currently selected
let targetImageData  = null; // ImageData of the uploaded target image

// ── DOM REFS ─────────────────────────────────────────────────────
const presetGrid        = document.getElementById('preset-grid');
const emptyState        = document.getElementById('empty-state');
const newPresetBtn      = document.getElementById('new-preset-btn');

// Gallery / Apply sections
const gallerySection    = document.getElementById('gallery-section');
const applySection      = document.getElementById('apply-section');
const applySub          = document.getElementById('apply-sub');
const deselectBtn       = document.getElementById('deselect-btn');
const presetPreviewImg  = document.getElementById('preset-preview-img');
const presetRefName     = document.getElementById('preset-ref-name');

// Target upload
const targetUploadZone  = document.getElementById('target-upload-zone');
const targetUploadInner = document.getElementById('target-upload-inner');
const targetPreviewImg  = document.getElementById('target-preview-img');
const targetFileInput   = document.getElementById('target-file-input');

// Result
const resultCard        = document.getElementById('result-card');
const resultCanvas      = document.getElementById('result-canvas');
const downloadBtn       = document.getElementById('download-btn');

// Rearrange bar
const rearrangeBar      = document.getElementById('rearrange-bar');
const rearrangeBtn      = document.getElementById('rearrange-btn');
const rearrangeLabel    = document.getElementById('rearrange-label');
const spinner           = document.getElementById('spinner');

// Modal
const modalOverlay      = document.getElementById('modal-overlay');
const modalCloseBtn     = document.getElementById('modal-close-btn');
const modalCancelBtn    = document.getElementById('modal-cancel-btn');
const modalSaveBtn      = document.getElementById('modal-save-btn');
const presetUploadZone  = document.getElementById('preset-upload-zone');
const presetUploadInner = document.getElementById('preset-upload-inner');
const presetUploadPreview = document.getElementById('preset-upload-preview');
const presetFileInput   = document.getElementById('preset-file-input');
const presetNameInput   = document.getElementById('preset-name-input');

// Work canvas (hidden, used for pixel processing)
const workCanvas        = document.getElementById('work-canvas');
const workCtx           = workCanvas.getContext('2d', { willReadFrequently: true });

// ── STORAGE ──────────────────────────────────────────────────────
function loadPresets() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    presets = raw ? JSON.parse(raw) : [];
  } catch {
    presets = [];
  }
}

function savePresets() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
}

// ── PIXEL MAP GENERATION ─────────────────────────────────────────
/**
 * Given an ImageData, compute a pixelMap:
 *   an array of pixel indices (0 … W*H-1) sorted by perceived brightness.
 * Storing this sorted order is the "preset" — it captures the
 * spatial brightness layout of the reference image.
 */
function computePixelMap(imageData) {
  const { data, width, height } = imageData;
  const count = width * height;

  // Build [{ index, brightness }, …] then sort by brightness
  const pixels = new Array(count);
  for (let i = 0; i < count; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    // Perceived luminance (ITU-R BT.709)
    pixels[i] = { index: i, lum: 0.2126 * r + 0.7152 * g + 0.0722 * b };
  }
  pixels.sort((a, b) => a.lum - b.lum);

  // The pixelMap is the list of original indices in sorted (dark→light) order
  return pixels.map(p => p.index);
}


// ── IMAGE HELPERS ─────────────────────────────────────────────────
/** Load an image File → returns an HTMLImageElement promise */
function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = reject;
    img.src = url;
  });
}

/** Draw an image onto the workCanvas at WORK_SIZE and return its ImageData */
function imageToImageData(img) {
  workCanvas.width  = WORK_SIZE;
  workCanvas.height = WORK_SIZE;
  workCtx.clearRect(0, 0, WORK_SIZE, WORK_SIZE);
  // Center-crop to square
  const size = Math.min(img.width, img.height);
  const sx   = (img.width  - size) / 2;
  const sy   = (img.height - size) / 2;
  workCtx.drawImage(img, sx, sy, size, size, 0, 0, WORK_SIZE, WORK_SIZE);
  return workCtx.getImageData(0, 0, WORK_SIZE, WORK_SIZE);
}

/** Get a small thumbnail data-URL from an image */
function getThumbnail(img) {
  workCanvas.width  = 300;
  workCanvas.height = 300;
  workCtx.clearRect(0, 0, 300, 300);
  const size = Math.min(img.width, img.height);
  const sx   = (img.width  - size) / 2;
  const sy   = (img.height - size) / 2;
  workCtx.drawImage(img, sx, sy, size, size, 0, 0, 300, 300);
  return workCanvas.toDataURL('image/jpeg', 0.75);
}

/** Compress a pixelMap (Uint32 array) to a compact base64 string */
function encodePixelMap(pixelMap) {
  const buf = new Uint32Array(pixelMap);
  const bytes = new Uint8Array(buf.buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

/** Decode a base64 pixelMap string back to an Array of numbers */
function decodePixelMap(encoded) {
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const buf = new Uint32Array(bytes.buffer);
  return Array.from(buf);
}

// ── RENDER ────────────────────────────────────────────────────────
function renderPresetGrid() {
  presetGrid.innerHTML = '';

  if (presets.length === 0) {
    emptyState.classList.remove('hidden');
    return;
  }
  emptyState.classList.add('hidden');

  presets.forEach(preset => {
    const card = document.createElement('div');
    card.className = 'preset-card' + (selectedPreset?.id === preset.id ? ' selected' : '');
    card.dataset.id = preset.id;

    const date = new Date(preset.createdAt);
    const dateStr = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

    card.innerHTML = `
      <img class="preset-card-thumb" src="${preset.thumbnail}" alt="${escHtml(preset.name)}" />
      <div class="preset-card-footer">
        <div style="overflow:hidden">
          <div class="preset-card-name">${escHtml(preset.name)}</div>
          <div class="preset-card-date">${dateStr}</div>
        </div>
        <button class="preset-delete-btn" data-id="${preset.id}" title="Delete preset" aria-label="Delete ${escHtml(preset.name)}">✕</button>
      </div>
    `;

    // Click card body → select
    card.addEventListener('click', e => {
      if (e.target.closest('.preset-delete-btn')) return;
      selectPreset(preset.id);
    });

    // Delete button
    card.querySelector('.preset-delete-btn').addEventListener('click', e => {
      e.stopPropagation();
      deletePreset(preset.id);
    });

    presetGrid.appendChild(card);
  });
}

function escHtml(str) {
  return str.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// ── PRESET CRUD ────────────────────────────────────────────────────
function deletePreset(id) {
  presets = presets.filter(p => p.id !== id);
  savePresets();
  if (selectedPreset?.id === id) {
    deselect();
  }
  renderPresetGrid();
}

function selectPreset(id) {
  selectedPreset = presets.find(p => p.id === id) || null;
  if (!selectedPreset) return;

  // Update apply section
  presetPreviewImg.src = selectedPreset.thumbnail;
  presetRefName.textContent = selectedPreset.name;
  applySub.textContent = `Selected: ${selectedPreset.name} — upload a target image below`;

  // Reset target & result
  targetImageData = null;
  targetPreviewImg.src = '';
  targetPreviewImg.classList.add('hidden');
  targetUploadInner.classList.remove('hidden');
  resultCard.classList.add('hidden');
  rearrangeBar.classList.add('hidden');

  applySection.classList.remove('hidden');
  applySection.scrollIntoView({ behavior: 'smooth', block: 'start' });

  renderPresetGrid(); // update selected state
}

function deselect() {
  selectedPreset = null;
  targetImageData = null;
  applySection.classList.add('hidden');
  renderPresetGrid();
}

// ── MODAL ─────────────────────────────────────────────────────────
let pendingPresetImage = null; // HTMLImageElement

function openModal() {
  pendingPresetImage = null;
  presetUploadPreview.src = '';
  presetUploadPreview.classList.add('hidden');
  presetUploadInner.classList.remove('hidden');
  presetNameInput.value = '';
  modalSaveBtn.disabled = true;
  modalOverlay.classList.remove('hidden');
  presetNameInput.focus();
}

function closeModal() {
  modalOverlay.classList.add('hidden');
  pendingPresetImage = null;
}

function validateModal() {
  modalSaveBtn.disabled = !(pendingPresetImage && presetNameInput.value.trim().length > 0);
}

async function savePreset() {
  if (!pendingPresetImage || !presetNameInput.value.trim()) return;

  modalSaveBtn.disabled = true;
  modalSaveBtn.textContent = 'Processing…';

  // Small delay so the UI updates before heavy computation
  await new Promise(r => setTimeout(r, 50));

  try {
    const thumbnail = getThumbnail(pendingPresetImage);
    const imageData = imageToImageData(pendingPresetImage);
    const rawMap    = computePixelMap(imageData);
    const pixelMap  = encodePixelMap(rawMap);

    const preset = {
      id:        crypto.randomUUID(),
      name:      presetNameInput.value.trim(),
      createdAt: Date.now(),
      thumbnail,
      pixelMap,
    };

    presets.unshift(preset);
    savePresets();
    closeModal();
    renderPresetGrid();
  } catch (err) {
    console.error('Failed to save preset:', err);
    alert('Failed to process the image. Please try a different file.');
  } finally {
    modalSaveBtn.disabled = false;
    modalSaveBtn.textContent = 'Save Preset';
  }
}

// ── REARRANGE ─────────────────────────────────────────────────────
async function rearrangePixels() {
  if (!selectedPreset || !targetImageData) return;

  // Show spinner / Disable UI
  spinner.classList.remove('hidden');
  rearrangeLabel.textContent = 'Analyzing…';
  rearrangeBtn.disabled = true;
  downloadBtn.disabled = true;

  await new Promise(r => setTimeout(r, 60));

  try {
    const pixelMap = decodePixelMap(selectedPreset.pixelMap);
    const { data: targetData, width, height } = targetImageData;
    const count = width * height;

    // 1. Sort target pixels by brightness
    rearrangeLabel.textContent = 'Sorting…';
    const sortedTarget = new Array(count);
    for (let i = 0; i < count; i++) {
      const r = targetData[i * 4];
      const g = targetData[i * 4 + 1];
      const b = targetData[i * 4 + 2];
      sortedTarget[i] = { index: i, lum: 0.2126 * r + 0.7152 * g + 0.0722 * b };
    }
    sortedTarget.sort((a, b) => a.lum - b.lum);

    // 2. Setup Canvas for animation
    resultCanvas.width = WORK_SIZE;
    resultCanvas.height = WORK_SIZE;
    const ctx = resultCanvas.getContext('2d', { alpha: false });
    ctx.fillStyle = '#06070f'; // match background
    ctx.fillRect(0, 0, WORK_SIZE, WORK_SIZE);
    
    resultCard.classList.remove('hidden');
    resultCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    
    // 3. Animation Loop (Chunked)
    rearrangeLabel.textContent = 'Rearranging…';
    const CHUNK_SIZE = 2048; // pixels per frame
    let currentRank = 0;

    const renderChunk = () => {
      const end = Math.min(currentRank + CHUNK_SIZE, count);
      const chunkBuffer = ctx.createImageData(WORK_SIZE, WORK_SIZE); // we'll use a local buffer to draw sparsely
      
      // We don't want to clear the canvas, just draw new pixels.
      // Easiest way in 2D API for individual pixels is manipulating an ImageData or using fillRect.
      // fillRect(1x1) is slow for thousands.
      // Better: we modify the result image data directly then putImageData.
      
      // Get existing image data or keep a persistent buffer
      const currentFullImageData = ctx.getImageData(0, 0, WORK_SIZE, WORK_SIZE);
      const fullData = currentFullImageData.data;

      for (let r = currentRank; r < end; r++) {
        const srcIdx  = sortedTarget[r].index;
        const destIdx = pixelMap[r];

        fullData[destIdx * 4]     = targetData[srcIdx * 4];
        fullData[destIdx * 4 + 1] = targetData[srcIdx * 4 + 1];
        fullData[destIdx * 4 + 2] = targetData[srcIdx * 4 + 2];
        fullData[destIdx * 4 + 3] = 255;
      }

      ctx.putImageData(currentFullImageData, 0, 0);
      currentRank = end;

      if (currentRank < count) {
        requestAnimationFrame(renderChunk);
      } else {
        // Done
        finishRearrange();
      }
    };

    requestAnimationFrame(renderChunk);

  } catch (err) {
    console.error('Rearrange failed:', err);
    alert('Failed to process image. Please try again.');
    finishRearrange();
  }
}

function finishRearrange() {
  spinner.classList.add('hidden');
  rearrangeLabel.textContent = '✦ Rearrange Pixels';
  rearrangeBtn.disabled = false;
  downloadBtn.disabled = false;
}

// ── DOWNLOAD ──────────────────────────────────────────────────────
function downloadResult() {
  resultCanvas.toBlob(blob => {
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href     = url;
    a.download = `imagify-${selectedPreset?.name?.replace(/\s+/g, '-') ?? 'result'}.png`;
    a.click();
    URL.revokeObjectURL(url);
  }, 'image/png');
}

// ── FILE UPLOAD HELPERS ────────────────────────────────────────────
function setupUploadZone(zone, fileInput, onFile) {
  // Click to open picker
  zone.addEventListener('click', () => fileInput.click());
  zone.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') fileInput.click(); });

  // File input change
  fileInput.addEventListener('change', () => {
    if (fileInput.files?.[0]) onFile(fileInput.files[0]);
    fileInput.value = '';
  });

  // Drag & drop
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) onFile(file);
  });
}

async function handlePresetImageFile(file) {
  try {
    pendingPresetImage = await loadImage(file);
    presetUploadPreview.src = URL.createObjectURL(file);
    presetUploadPreview.classList.remove('hidden');
    presetUploadInner.classList.add('hidden');
    validateModal();
  } catch {
    alert('Could not load the selected image.');
  }
}

async function handleTargetImageFile(file) {
  try {
    const img = await loadImage(file);
    targetImageData = imageToImageData(img);
    targetPreviewImg.src = URL.createObjectURL(file);
    targetPreviewImg.classList.remove('hidden');
    targetUploadInner.classList.add('hidden');
    rearrangeBar.classList.remove('hidden');
    resultCard.classList.add('hidden');
  } catch {
    alert('Could not load the selected image.');
  }
}

// ── EVENT LISTENERS ────────────────────────────────────────────────
newPresetBtn.addEventListener('click', openModal);
modalCloseBtn.addEventListener('click', closeModal);
modalCancelBtn.addEventListener('click', closeModal);
modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) closeModal(); });
modalSaveBtn.addEventListener('click', savePreset);
presetNameInput.addEventListener('input', validateModal);
presetNameInput.addEventListener('keydown', e => { if (e.key === 'Enter') savePreset(); });

deselectBtn.addEventListener('click', deselect);
rearrangeBtn.addEventListener('click', rearrangePixels);
downloadBtn.addEventListener('click', downloadResult);

// Modal upload zone
setupUploadZone(presetUploadZone, presetFileInput, handlePresetImageFile);
// Target upload zone
setupUploadZone(targetUploadZone, targetFileInput, handleTargetImageFile);

// Keyboard: close modal with Escape
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !modalOverlay.classList.contains('hidden')) closeModal();
});

// ── INIT ──────────────────────────────────────────────────────────
loadPresets();
renderPresetGrid();
