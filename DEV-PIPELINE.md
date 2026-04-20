# Dev pipeline reference (Windows + PowerShell)

This repo uses a small Gulp pipeline to support a tight Foundry VTT module dev loop:

- compile optional Less assets
- create a dev install in Foundry User Data via **symlink/junction** (with **copy fallback**)
- build a distributable `.zip` for manual install

Everything is driven by `package.json` scripts and `gulpfile.js`.

## Prerequisites

- Node.js (LTS)
- A Foundry VTT User Data folder with a `Data/` subfolder

## Project layout (what matters)

- `src/module.json`: Foundry manifest. Its `"id"` becomes the folder name under `Data/modules/`.
- `src/main.js`: module entry point (listed in `src/module.json` → `"esmodules"`).
- `foundryconfig.json`: points the pipeline at your Foundry User Data root.
- `gulpfile.js`: implements build/link/package tasks (Less, Handlebars panel → `src/generated/render-audio-receiver-panel.js`).
- `templates/*.hbs`: Handlebars sources; run `npm run compile:hbs` or full `npm run build` after editing them.
- `package/`: created by packaging. Contains the built `.zip`.

## Configure Foundry User Data path

Edit `foundryconfig.json`:

- `"dataPath"` must point at the **Foundry user data root** (the folder that contains `Data/`)
- You can use the default placeholder: `"${env:AppData}/FoundryVTT/"`

### How `${env:AppData}` is resolved

On Windows, the link task tries to resolve `${env:AppData}` using the `AppData` environment variable and then switches `Roaming` → `Local` (Foundry’s default location).

If you use a custom User Data location, set an absolute path instead, e.g.:

```json
{
  "dataPath": "D:/FoundryData/",
  "repository": ""
}
```

Requirement: `D:/FoundryData/Data` must exist.

## The main commands (PowerShell)

Install dependencies:

```powershell
npm install
```

Build and link (typical dev loop):

```powershell
npm run build
```

What it does:

- `gulp clean`: removes build artifacts that were generated into `src/` (currently only Less-derived CSS, if you use Less)
- `gulp build`: compiles `src/styles/*.less` to CSS (only if you have Less files)
- `gulp link`: creates/refreshes the dev install in Foundry User Data

Link only (if you just need to recreate the junction/copy):

```powershell
npm run link
```

Remove the dev install from Foundry User Data:

```powershell
npm run clean
```

Create a distributable zip:

```powershell
npm run package
```

Output:

- `package/<moduleId>-v<version>.zip`

The zip contains a single top-level folder named after the manifest `"id"` (what Foundry expects).

## How the link step works (important)

When you run `gulp link`, the pipeline:

1. Reads `src/module.json` to get `"id"` (this becomes the Foundry folder name).
2. Reads `foundryconfig.json` to find your User Data root.
3. Computes the target:
   - `<UserDataRoot>/Data/modules/<moduleId>`
4. Removes any existing target folder.
5. Tries to create a **directory junction** pointing to this repo’s `src/`.
6. If junction creation fails (common on some drives/permissions), it falls back to a **real copy** of `src/` into Foundry’s module folder.

### Why junction/copy matters

- Junction mode: Foundry loads your working tree directly (fastest edit loop).
- Copy fallback: still works even when symlinks/junctions are blocked, but you must re-run `npm run build` after changes.

## How to debug the pipeline

- If `npm run build` fails early, check that `foundryconfig.json` points at the right place and that `<dataPath>/Data` exists.
- If linking fails due to permissions, run your terminal as Administrator, or rely on the copy fallback.
- If Foundry doesn’t see the module, check the folder name under `Data/modules/` matches `src/module.json` → `"id"`.

