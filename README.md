# ✦ Imagify — Pixel Preset Studio

> Transform images by mapping their pixels onto a saved preset's spatial layout.

## What is it?

**Imagify** lets you create reusable *presets* from any image. A preset captures the brightness-based pixel ordering of a reference image. When you apply a preset to a new image, that image's pixels are rearranged to match the spatial layout of the preset — producing a unique pixel-sorted composition.

## Features

- 🎨 **Create presets** from any image (PNG, JPG, WEBP)
- 💾 **Persistent storage** — presets survive browser refreshes via `localStorage`
- 🗑️ **Deletable presets** — remove any preset with one click
- ✦ **Pixel rearrangement** — apply a preset to any target image
- ⬇️ **Download** the resulting image as a PNG
- 📱 Fully responsive, works on desktop and mobile
- 🌙 Sleek dark-mode UI with glassmorphism design

## How to Use

1. Open `index.html` in your browser (or serve with any static file server)
2. Click **"+ New Preset"** → upload an image → give it a name → **Save Preset**
3. Click a preset card to select it
4. Upload a **target image** in the Apply panel
5. Click **"✦ Rearrange Pixels"** and watch the magic happen
6. Click **"⬇ Download Result"** to save your image

## How the Algorithm Works

The pixel rearrangement uses a brightness-rank mapping technique:

1. Both the preset and target images are scaled to a 512×512 internal canvas
2. Every pixel's **perceived luminance** is computed using the ITU-R BT.709 formula:  
   `L = 0.2126·R + 0.7152·G + 0.0722·B`
3. The preset's pixels are sorted dark→light to produce an *index permutation* (the "pixel map")
4. The target's pixels are also sorted dark→light
5. Each ranked target pixel is placed into the position dictated by the preset's pixel map

Result: the target image's colors are spatially distributed to match the visual structure of the preset.

## Tech Stack

- Pure **HTML5 / CSS3 / Vanilla JS** — zero dependencies, no build step required
- `localStorage` for preset persistence
- `<canvas>` API for all pixel manipulation
- Google Fonts (Inter)

## Running Locally

Just open `index.html` directly in your browser, or use any static server:

```bash
npx serve .
# then visit http://localhost:3000
```