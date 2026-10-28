# Lions Playbook

The Lions basketball playbook as a website. Teammates open it on their phone or laptop, pick a play, and step through it frame by frame or watch it play. It still opens in a gym with bad wifi as long as they've visited it once before.

**Team link:** https://bball4ever.github.io/Lions-Basketball-Playbook/

The **Share** button on the site shows the link with a QR code to scan.

## Pages

- `index.html` is the team view: every play grouped by type, view only.
- `edit.html` is the editor where plays get drawn. Open it at https://bball4ever.github.io/Lions-Basketball-Playbook/edit.html. It saves in your browser only, so nothing changes for the team until you upload a new `plays.json`.

## Updating plays

1. Open the editor and make your changes. They save in that browser as you go.
2. Click **Export plays.json** to download the file.
3. On GitHub, open this repo, click **Add file > Upload files**, drop in the downloaded `plays.json` (it replaces the old one), and click **Commit changes** on `main`.
4. Wait a minute or two. The **Actions** tab shows the deploy; when it's green the team sees the new plays.

The first time the editor opens in a browser, it loads the plays from the site. **Reload from site** in the editor throws away what's saved in that browser and loads the site's `plays.json` again, which is handy when you switch computers.

## How it's put together

Plain HTML, CSS and JavaScript with no build step. GitHub Pages serves the files as they are.

- `js/core.js`: play logic (positions, spot names, readout)
- `js/draw.js`: court and play drawing, and animation frames
- `js/viewer.js`: frame tabs, Back, Next, Play all and Full diagram, used by both pages
- `js/team.js` and `js/editor.js`: each page's own parts
- `sw.js`: keeps a copy for when the wifi is bad. It always tries the network first, so updates show up right away.
- `.github/workflows/pages.yml`: deploys to GitHub Pages on every push to `main`

`fonts/` holds Barlow, Big Shoulders Display (SIL Open Font License) and Permanent Marker (Apache License 2.0). `vendor/qrcode.js` is [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) 2.0.4 by Kazuhiko Arase (MIT License).
