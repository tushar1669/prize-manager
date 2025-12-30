# Branding Assets Upload Guide

This repository intentionally omits binary brand assets to avoid PR failures. Upload the files below manually after merge.

## Required uploads

Place these images in the public assets folder so they can be served from the URLs used in the app:

- `public/brand/prize-manager-logo.png` → `/brand/prize-manager-logo.png`
- `public/brand/prize-manager-icon.png` → `/brand/prize-manager-icon.png`

## Favicon behavior

The app uses `/brand/prize-manager-icon.png` as the preferred favicon (with cache-busting query string). Browsers will use this PNG icon for tabs and bookmarks.

**Fallback**: `/favicon.ico` is still referenced as a fallback for older browsers. You may optionally replace it with a Prize-Manager branded .ico file.

### Cache busting

The favicon links include `?v=pm-2025-12-31-01` to bust browser caches. When updating the icon:

1. Replace the PNG file in `public/brand/`
2. Update the version string in `index.html` (e.g., `?v=pm-2025-01-15-01`)
3. Users may need to hard refresh (Ctrl+Shift+R / Cmd+Shift+R) to see updates

### Manual binary step checklist

After merging this PR:

- [ ] Optionally replace `public/favicon.ico` with a Prize-Manager branded .ico file
- [ ] Verify `public/brand/prize-manager-icon.png` exists (32x32 or larger square PNG)
- [ ] Hard refresh browser to confirm new favicon appears

## Palette tokens

- Navy: `#0B3D91`
- Gold: `#CDAA59`
