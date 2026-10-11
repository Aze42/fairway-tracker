# Fairway – golf tracker (PWA)

Course info, shot-by-shot tracking, round history and stats. Works on iPhone with no App Store and no developer account.

## Run it
It is plain HTML/JS, no build step, but it must be served over **HTTPS** (needed for install, offline and GPS on iPhone).

**Easiest: GitHub Pages**
1. Create a GitHub repo, upload the contents of this folder, enable Settings → Pages (branch `main`, root).
2. Open the `https://<you>.github.io/<repo>/` URL in **Safari** on the iPhone.
3. Share → **Add to Home Screen**.

(Netlify Drop also works: drag this folder onto app.netlify.com/drop.)

**Test on your PC:** `python -m http.server 8000` in this folder, then open http://localhost:8000.

## Data
Stored on the phone (IndexedDB). Use Settings → Export backup regularly. Courses can be searched on OpenStreetMap (needs internet; coverage varies) or entered by hand.
