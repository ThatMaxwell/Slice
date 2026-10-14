# What people love about browser design, and what Slice took from it

Research notes gathered before building Slice (October 2026).

## Dia (The Browser Company)
- **Familiar first.** Its design lead's goal was to let "anyone switch to Dia at 10am on a Tuesday": a minimal UI that stays out of the way. ([Thurrott](https://www.thurrott.com/cloud/web-browsers/322287/the-browser-company-explains-its-vision-for-dia))
- **Small crafted details** are what reviewers praise: the page's colour extends up into the tab, the Assistant bar animates fluidly, and the bookmarks bar was reimagined. ([Thurrott](https://www.thurrott.com/?p=322287))
- **The URL bar accepts plain language.** A sidebar assistant reads your tabs, and "Skills" are saved prompts. ([Wikipedia](https://en.wikipedia.org/wiki/Dia_(web_browser)), [TechCrunch](https://techcrunch.com/2025/11/03/dias-ai-browser-starts-adding-arcs-greatest-hits-to-its-feature-set))
- **Weak spots:** some reviewers find it a "stripped-down Chrome" with top tabs ([TidBITS](https://tidbits.com/?p=70764)), and Windows support lags behind ([Efficient](https://efficient.app/apps/dia)).
- **Landing page:** one calm, single-column story ("More than a browser. A better workday."), numbered steps, feature cards with screenshots, and a privacy section built from a mock settings panel.

**→ Slice:** the new-tab AI bar, a "chat with this page" sidebar, site-colour toolbar tinting, fluid micro-animations, Windows first, and a privacy section drawn as a real settings mock.

## Arc
- **Sidebar instead of a tab strip**, which suits widescreen monitors. ([Wikipedia](https://en.wikipedia.org/wiki/Arc_(web_browser)))
- **A command bar** that searches tabs, history and actions, like Spotlight. ([design study](https://blakecrosley.com/guides/design/arc))
- **Spaces** with their own themes keep work and personal browsing apart.

**→ Slice:** sidebar mode, an omnibox that also switches tabs and offers "Ask Slice", and per-theme colour washes.

## Zen
- **Compact mode** is the single most-praised feature: hide everything and reveal it on hover. ([MakeTechEasier](https://maketecheasier.com/replacing-firefox-with-zen-browser/), [Slashdot](https://news.slashdot.org/story/24/09/23/0353206))
- Vertical tabs that collapse to icons, plus Glance, Split View and Workspaces.
- **Mood:** "welcome to a calmer internet", with care about your experience rather than your data. ([zen-browser.app](https://zen-browser.app/))
- The main criticism is bugs and growing pains. Polish matters as much as features.

**→ Slice:** compact mode for both layouts, calm motion, private-by-default copy.

## Vivaldi and Opera (GX / One)
- **Maximum customisation.** Theme editor (colours, icons, backgrounds), theme schedules, sharing themes, Workspaces. ([Vivaldi 6.0](https://vivaldi.com/blog/vivaldi-on-desktop-6-0/))
- **GX Mods / Opera One** add animated themes, shaders, sounds, and sidebar opacity and blur sliders. ([Opera GX Mods](https://www.opera.com/gx/features/mods), [Opera One R2](https://blogs.opera.com/news/?p=4329))

**→ Slice:** 11 themes plus any colour, a colour-intensity slider, glass opacity, radius, density, fonts, custom-CSS "Mods", theme export and import, and a startup chime on the website.

## What users ask for in general
- A **minimal, clean UI without bloat**. Clutter and forced AI or crypto features are the top complaints, which is why there's demand for things like Brave Origin. ([Privacy Guides](https://discuss.privacyguides.net/t/lightweight-brave-browser/34960.md))
- **uBlock Origin** is the default recommendation, and ungoogled-chromium and LibreWolf are the go-to "less bloat" picks.

**→ Slice:** uBlock Origin lists on by default, de-Googled flags, and AI that's opt-in at the top bar (that bar stays plain search).

## Model choice
- Latest Flash-Lite as of October 2026: **`gemini-3.5-flash-lite`** (stable, released 21 Jul 2026). ([Firebase AI Logic models](https://firebase.google.com/docs/ai-logic/models), [Gemini 3.6 / 3.5 notes](https://ai.google.dev/gemini-api/docs/whats-new-gemini-3.6))
- It's available on Puter.js as `google/gemini-3.5-flash-lite`. ([Puter](https://developer.puter.com/ai/google/gemini-3.5-flash-lite/))
