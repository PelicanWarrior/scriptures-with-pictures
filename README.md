# Scriptures with Pictures

A Next.js app that pulls Bible content from `wol.jw.org` and lets you attach picture URLs and captions to specific verses.

## Run

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

## Build And Lint

```bash
npm run lint
npm run build
```

## Debug

- VS Code launch config: `Next.js: Debug Server`
- VS Code task: `Run Next.js Dev Server`

## Features

- Browse Bible books, chapters, and full chapter text.
- Add image URL and caption to a selected verse.
- See markers next to verses that have linked pictures.
- Click a verse to show its linked image and caption.
- See current location at the top (`Book` or `Book Chapter N`) and use back navigation.
