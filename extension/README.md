# SafeMind browser extension

This directory is a standards-based Manifest V3 WebExtension for:

- Google Chrome, Microsoft Edge, Brave, Opera, Vivaldi, and other Chromium browsers
- Firefox desktop and Firefox for Android
- Safari after packaging it as a Safari Web Extension app

The extension requests only the `storage` permission. It cannot read tabs, page content, browsing history, passwords, or form data. The stored value is the configured SafeMind website address.

## Configure the website

The default address is `https://safemind.app/`. Open the extension settings after installation to use a different deployment or a local development address such as `http://127.0.0.1:5173/`.

## Chromium installation

1. Open the browser's extension management page.
2. Enable developer mode.
3. Choose **Load unpacked** and select this `extension` directory.

## Firefox installation

1. Open `about:debugging#/runtime/this-firefox`.
2. Choose **Load Temporary Add-on**.
3. Select `manifest.json` from this directory.

Publishing through addons.mozilla.org requires signing. The manifest includes a Firefox extension ID and declares that no data is collected or transmitted.

## Safari packaging

Safari requires a signed app wrapper. With current Xcode command-line tools, run:

```sh
xcrun safari-web-extension-packager ./extension \
  --app-name SafeMind \
  --bundle-identifier app.safemind.extension \
  --project-location ./safari-extension
```

Open the generated Xcode project, select your Apple Developer signing team, build the app, and enable the extension in Safari settings.

## Validation

Run:

```sh
npm run test:extension
```

Store submission, signing, review, privacy declarations, and developer-account fees remain browser-vendor requirements and cannot be automated by this repository.
