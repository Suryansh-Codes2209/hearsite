---
name: hearsite
description: Use when the user wants to hear, see or read what a screen reader announces on a web page, asks what a blind or screen reader user experiences on a site, or wants a narrated accessibility walkthrough video or reading-order transcript of a URL or local page.
---

# hearsite

`hearsite` opens a page in headless Chromium, reads its accessibility tree, and produces a narrated, captioned video plus a transcript of everything a screen reader would announce, in order.

It is a simulation of the page as first loaded. Never tell the user a page "is accessible", "is OK" or "passes" because hearsite found nothing. Say what it found, what it does not check, and that real screen readers and real users must still be tested.

## Run

```bash
# Transcript only: fast, use this to analyse a page yourself
npx hearsite <url> --no-video -o <dir>/page.mp4      # writes <dir>/page.txt

# Narrated video to show a person
npx hearsite <url> -o <dir>/page.mp4                 # writes page.mp4 and page.txt
```

`<url>` can be a full URL, `localhost:3000/signup`, or a path to an HTML file; a local dev server must already be running. The transcript always covers the whole page. `npx hearsite --help` lists every option.

Needs `ffmpeg` and Playwright's Chromium. Voice uses macOS `say` or `espeak-ng`; if neither exists it prints "No speech engine found" and the video has captions only, so tell the user.

## Options that matter

| Situation | Add |
| --- | --- |
| Video should cover more of the page | `-n 150`. Default is the first 60 announcements; allow about 2 seconds each. The total is stated near the top of the transcript, so run `--no-video` first to choose. |
| Continue in a second video | `--start 150` |
| Content appears after load | `--wait 3000` |
| Phone layout | `--mobile` (changes the layout, so the site may expose different content) |
| Sharper video | `--scale 2` |
| Slower speech, other voice | `--rate 170`, `--voice <name>` |

## Reading the transcript

The top lists the findings, or "Nothing unlabelled was found." The numbered list is the reading order, starting with the page title. A transcript with only a few lines, or one that reads like an error or login page, means the capture failed, not that the page is clean.

Problems are marked in square brackets on the line of the element:

| Marker | Usual fix |
| --- | --- |
| `link has no name`, `button has no name` | Visible text, or `aria-label` on an icon-only control |
| `image has no description` | `alt` text, or `alt=""` if decorative |
| `field has no label` | A `<label>` tied to the field |
| `empty heading`, heading skips a level, no level 1 heading | Real heading text and levels in order |
| `frame has no title`, `page has no title` | `title` attribute, `<title>` |
| No main landmark | A `<main>` element |

## Fixing the user's own page

1. Run with `--no-video` against the local dev server.
2. For each marked line, find the element in the source and fix the cause.
3. Run again; confirm the markers are gone and the reading order makes sense read aloud.
4. Make the video only if the user wants to watch or share it.

## Say this when reporting

- **Not checked:** colour contrast, keyboard operation, focus order, and anything that needs interaction. Menus are not opened and forms are not filled in or submitted, so error messages and focus handling are untested.
- Wording differs between VoiceOver, NVDA and JAWS. Check a finding about someone else's site in a real screen reader before it is published.
- Real users jump between headings and landmarks, so missing ones matter more than total listening time.
