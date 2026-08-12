(function () {
  // Assets load from GitHub Pages (repo stays private — no public raw URLs).
  const comingSoon = document.getElementById("coming-soon");
  const announcement = document.getElementById("announcement");
  const heroStage = document.querySelector(".hero-stage");
  const heroPin = document.querySelector(".hero-pin");
  const heroEl = document.querySelector(".hero");
  const heroMediaSlot = document.getElementById("hero-media-slot");
  const heroMedia = document.getElementById("hero-media");
  const heroImage = document.getElementById("hero-image");
  const firstNameEl = document.getElementById("first-name");
  const middleLastEl = document.getElementById("middle-last");
  const detailsEl = document.getElementById("details");
  const galleryA = document.getElementById("gallery-a");
  const galleryB = document.getElementById("gallery-b");
  const themeColorMeta = document.querySelector('meta[name="theme-color"]');
  const DEFAULT_THEME_COLOR = themeColorMeta
    ? themeColorMeta.getAttribute("content") || "#f0e4e8"
    : "#f0e4e8";

  /** @type {string|number} */
  let assetVersion = "";

  function orientOf(width, height) {
    if (!width || !height) return "portrait";
    const ratio = width / height;
    if (ratio > 1.05) return "landscape";
    if (ratio < 0.95) return "portrait";
    return "square";
  }

  function resolveAssetUrl(src) {
    if (!src) return "";
    if (/^https?:\/\//i.test(src) || src.startsWith("data:")) return src;
    if (src.startsWith("../") || src.startsWith("/")) return src;
    const path = src.replace(/^\.\//, "");
    return assetVersion
      ? path + "?v=" + encodeURIComponent(assetVersion)
      : path;
  }

  function normalizePhoto(entry) {
    if (!entry) return null;
    if (typeof entry === "string") {
      return { src: resolveAssetUrl(entry), orient: "" };
    }
    if (!entry.src) return null;
    return {
      src: resolveAssetUrl(entry.src),
      orient: entry.orient || "",
      width: entry.width || 0,
      height: entry.height || 0,
      full: entry.full ? resolveAssetUrl(entry.full) : "",
      fullWidth: entry.fullWidth || 0,
    };
  }

  function hasAnnouncement(data) {
    return Boolean(data && String(data.firstName || "").trim());
  }

  /** Root stays blank until data.live; /announcement/ can preview earlier. */
  function requiresPublicLive() {
    const path = window.location.pathname || "/";
    if (path.includes("/announcement")) return false;
    return path === "/" || /\/index\.html$/i.test(path);
  }

  function setBooting(on) {
    document.documentElement.classList.toggle("is-booting", Boolean(on));
    if (on) window.scrollTo(0, 0);
  }

  function setRootEmptyState(on) {
    const isRootEmpty = Boolean(on);
    document.documentElement.classList.toggle("is-root-empty", isRootEmpty);
    if (!themeColorMeta) return;
    themeColorMeta.setAttribute(
      "content",
      isRootEmpty ? "#ffffff" : DEFAULT_THEME_COLOR
    );
  }

  function showBlank() {
    setRootEmptyState(requiresPublicLive());
    if (comingSoon) comingSoon.hidden = true;
    if (announcement) announcement.hidden = true;
    document.title = "A New Arrival";
    setBooting(false);
  }

  function waitForHeroImage() {
    return new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      // Do not call img.decode() here — Safari rejects with "Load failed"
      // when the image is under visibility/display hiding during boot.
      if (heroImage.complete && heroImage.naturalWidth) {
        finish();
        return;
      }
      heroImage.addEventListener("load", finish, { once: true });
      heroImage.addEventListener("error", finish, { once: true });
      window.setTimeout(finish, 8000);
    });
  }

  function buildDetails(data) {
    const parts = [data.date, data.time, data.weightKg, data.weightLbOz]
      .map((p) => String(p || "").trim())
      .filter(Boolean);

    detailsEl.replaceChildren();
    parts.forEach((part, index) => {
      if (index > 0) {
        const sep = document.createElement("span");
        sep.className = "sep";
        sep.setAttribute("aria-hidden", "true");
        sep.textContent = "•";
        detailsEl.appendChild(sep);
      }
      const item = document.createElement("span");
      item.className = "detail-item";
      item.textContent = part;
      detailsEl.appendChild(item);
    });
  }

  function ensureOrient(photo) {
    return new Promise((resolve) => {
      if (photo.orient) {
        resolve(photo);
        return;
      }
      const img = new Image();
      img.onload = () => {
        photo.orient = orientOf(img.naturalWidth, img.naturalHeight);
        resolve(photo);
      };
      img.onerror = () => {
        photo.orient = "portrait";
        resolve(photo);
      };
      img.src = photo.src;
    });
  }

  function createGalleryItem(photo, options) {
    const figure = document.createElement("figure");
    figure.className =
      "mosaic-item is-" + (photo.orient || "portrait");

    const img = document.createElement("img");
    img.src = photo.src;
    img.alt = "";
    const eager = Boolean(options && options.eager);
    img.loading = eager ? "eager" : "lazy";
    img.fetchPriority = eager ? "high" : "low";
    img.decoding = "async";

    figure.appendChild(img);
    return figure;
  }

  function isPortraitish(orient) {
    return orient === "portrait" || orient === "square";
  }

  function allowMultiColumnLayout() {
    return window.matchMedia("(min-width: 640px)").matches;
  }

  /** Pack photos into mosaic bricks: wide / duo / feature / trio.
   *  Below 640px: one photo per row (no crop). */
  function buildMosaic(photos, allowMultiColumn) {
    const rows = [];
    let i = 0;
    let portraitCount = 0;

    while (i < photos.length) {
      const current = photos[i];

      if (current.orient === "landscape") {
        rows.push({ type: "wide", photos: [current] });
        i += 1;
        continue;
      }

      portraitCount += 1;

      // Occasional full-width portrait for rhythm
      if (!allowMultiColumn || portraitCount % 6 === 0) {
        rows.push({ type: "feature", photos: [current] });
        i += 1;
        continue;
      }

      const next = photos[i + 1];
      const third = photos[i + 2];
      const nextPort = next && isPortraitish(next.orient);
      const thirdPort = third && isPortraitish(third.orient);

      if (nextPort && thirdPort) {
        rows.push({ type: "trio", photos: [current, next, third] });
        portraitCount += 2;
        i += 3;
        continue;
      }

      if (nextPort) {
        rows.push({ type: "duo", photos: [current, next] });
        portraitCount += 1;
        i += 2;
        continue;
      }

      rows.push({ type: "feature", photos: [current] });
      i += 1;
    }

    return rows;
  }

  function renderGallery(container, photos, stripeOffset, eagerCount) {
    container.replaceChildren();
    container.classList.add("mosaic");
    if (!photos.length) return 0;

    const offset = stripeOffset || 0;
    const eagerLimit =
      typeof eagerCount === "number" ? Math.max(0, eagerCount) : 0;
    let photoIndex = 0;
    const rows = buildMosaic(photos, allowMultiColumnLayout());
    rows.forEach((row, index) => {
      const rowEl = document.createElement("div");
      const stripe =
        (offset + index) % 2 === 0 ? "stripe-a" : "stripe-b";
      rowEl.className = "mosaic-row " + row.type + " " + stripe;
      row.photos.forEach((photo) => {
        rowEl.appendChild(
          createGalleryItem(photo, { eager: photoIndex < eagerLimit })
        );
        photoIndex += 1;
      });
      container.appendChild(rowEl);
    });
    return rows.length;
  }

  /** @type {any[] | null} */
  let cachedGalleryPhotos = null;
  let lastMultiColumnPref = allowMultiColumnLayout();

  function paintGalleries(photos) {
    cachedGalleryPhotos = photos;
    lastMultiColumnPref = allowMultiColumnLayout();
    const midpoint = Math.ceil(photos.length / 2);
    // Keep eager loads minimal so mobile can show the hero quickly.
    const rowCountA = renderGallery(
      galleryA,
      photos.slice(0, midpoint),
      0,
      2
    );
    renderGallery(galleryB, photos.slice(midpoint), rowCountA, 0);
  }

  /** Once a real announcement has been shown, never flash Coming soon again. */
  let announcementRevealed = false;

  function showComingSoon() {
    if (announcementRevealed) return;
    setRootEmptyState(false);
    comingSoon.hidden = false;
    announcement.hidden = true;
    document.title = "A New Arrival";
    setBooting(false);
  }

  const reduceMotionQuery = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  );
  /** @type {{ w: number, h: number } | null} */
  let heroEndSize = null;
  let heroScrubRaf = 0;
  let heroSlotSized = false;
  /** Full-bleed zoom is a one-shot first-load effect. */
  let heroIntroDone = false;
  /** Intro progress only moves forward — scrolling back up never re-zooms. */
  let heroMaxProgress = 0;
  /** Scroll range frozen at intro start (mobile URL bars resize mid-scroll). */
  let heroIntroRange = 0;

  function clamp01(value) {
    return Math.min(1, Math.max(0, value));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  /** Viewport height that ignores mobile URL bar collapse (matches svh). */
  function stableViewportHeight() {
    const doc = document.documentElement;
    const clientH = doc ? doc.clientHeight : 0;
    return clientH > 0
      ? Math.min(window.innerHeight, clientH)
      : window.innerHeight;
  }

  function prefersReducedMotion() {
    return reduceMotionQuery.matches;
  }

  function clearHeroScrubStyles() {
    if (!heroMedia) return;
    heroMedia.classList.remove("is-scrubbing");
    heroMedia.style.position = "";
    heroMedia.style.left = "";
    heroMedia.style.top = "";
    heroMedia.style.width = "";
    heroMedia.style.height = "";
    heroMedia.style.right = "";
    heroMedia.style.bottom = "";
    heroMedia.style.margin = "";
    heroMedia.style.transform = "";
    if (heroImage) {
      heroImage.style.width = "";
      heroImage.style.height = "";
      heroImage.style.maxWidth = "";
      heroImage.style.maxHeight = "";
      heroImage.style.objectFit = "";
    }
  }

  function clearLandscapeStackWidth() {
    if (heroEl) {
      heroEl.style.width = "";
      heroEl.style.maxWidth = "";
    }
  }

  /** Keep landscape nameplate the same width as the photo. */
  function syncLandscapeStackWidth(size) {
    if (!heroStage || !heroStage.classList.contains("is-landscape") || !size) {
      clearLandscapeStackWidth();
      return;
    }
    const w = size.w + "px";
    if (heroEl) {
      heroEl.style.width = w;
      heroEl.style.maxWidth = "100%";
    }
    if (heroMediaSlot) {
      heroMediaSlot.style.width = w;
    }
  }

  function clearHeroSlotSize() {
    heroSlotSized = false;
    const keepLandscapeWidth =
      heroIntroDone &&
      heroStage &&
      heroStage.classList.contains("is-landscape") &&
      heroEndSize;
    const kept = keepLandscapeWidth ? heroEndSize : null;
    heroEndSize = null;
    if (heroMediaSlot) {
      heroMediaSlot.style.width = "";
      heroMediaSlot.style.height = "";
    }
    if (kept) {
      heroEndSize = kept;
      syncLandscapeStackWidth(kept);
      if (heroMediaSlot) heroMediaSlot.style.width = kept.w + "px";
    } else {
      clearLandscapeStackWidth();
    }
  }

  /** Resting hero box from natural image size + layout caps (avoids 0×0 landscape). */
  function computeHeroEndSize() {
    if (!heroImage || !heroPin || !heroStage) return null;
    const nw = heroImage.naturalWidth;
    const nh = heroImage.naturalHeight;
    if (!nw || !nh) return null;

    const pinRect = heroPin.getBoundingClientRect();
    const availableW = Math.max(80, pinRect.width);
    const viewportH = stableViewportHeight();
    const isLandscape = heroStage.classList.contains("is-landscape");
    const isWide = window.matchMedia("(min-width: 960px)").matches;
    const isDesktopRail =
      isWide &&
      (heroStage.classList.contains("is-portrait") ||
        heroStage.classList.contains("is-square"));

    let maxW;
    let maxH;
    if (isDesktopRail) {
      const rail = Math.min(352, Math.max(264, window.innerWidth * 0.28));
      maxW = Math.min(availableW - rail - 40, 46 * 16);
      maxH = viewportH - 4.5 * 16;
    } else if (isLandscape) {
      maxW = Math.min(availableW, window.innerWidth - 24, 64 * 16);
      // Leave room for nameplate + oversized first-name on mobile/landscape
      maxH = viewportH - 16 * 16;
    } else {
      maxW = Math.min(availableW, 26.5 * 16);
      maxH = viewportH - 14 * 16;
    }

    maxW = Math.max(80, maxW);
    maxH = Math.max(80, maxH);
    const aspect = nw / nh;
    let w = maxW;
    let h = w / aspect;
    if (h > maxH) {
      h = maxH;
      w = h * aspect;
    }
    return { w: Math.round(w), h: Math.round(h) };
  }

  /** Size the in-flow slot to the resting media box (no fixed scrub styles). */
  function ensureHeroSlotSize() {
    if (!heroMedia || !heroMediaSlot || !heroImage) return false;
    if (heroMedia.classList.contains("is-empty")) return false;
    if (!heroImage.naturalWidth) return false;

    if (heroSlotSized && heroEndSize) {
      heroMediaSlot.style.width = heroEndSize.w + "px";
      heroMediaSlot.style.height = heroEndSize.h + "px";
      syncLandscapeStackWidth(heroEndSize);
      return true;
    }

    const wasScrubbing = heroMedia.classList.contains("is-scrubbing");
    if (wasScrubbing) {
      // Never clear fixed mid-scroll just to measure — use cache only.
      if (heroEndSize) syncLandscapeStackWidth(heroEndSize);
      return Boolean(heroEndSize);
    }

    let size = computeHeroEndSize();
    if (!size) {
      const rect = heroMedia.getBoundingClientRect();
      if (rect.width >= 2 && rect.height >= 2) {
        size = { w: rect.width, h: rect.height };
      }
    }
    if (!size) return false;

    heroEndSize = size;
    heroMediaSlot.style.width = heroEndSize.w + "px";
    heroMediaSlot.style.height = heroEndSize.h + "px";
    syncLandscapeStackWidth(heroEndSize);
    heroSlotSized = true;
    return true;
  }

  function settleHeroIntro() {
    if (!heroStage || heroIntroDone) return;
    heroIntroDone = true;
    heroMaxProgress = 1;

    heroStage.classList.add("is-intro-done");
    heroStage.style.setProperty("--hero-progress", "1");
    // Keep the end-size slot so fixed → in-flow handoff doesn't jump.
    ensureHeroSlotSize();
    clearHeroScrubStyles();

    // Drop only the forced slot height after layout (width stays for landscape).
    window.requestAnimationFrame(() => {
      if (!heroMediaSlot || !heroEndSize) return;
      heroMediaSlot.style.height = "";
      heroSlotSized = false;
      if (heroStage.classList.contains("is-landscape")) {
        syncLandscapeStackWidth(heroEndSize);
        heroMediaSlot.style.width = heroEndSize.w + "px";
      }
    });
  }

  function applyHeroScrub() {
    if (!heroStage) return;

    if (prefersReducedMotion()) {
      settleHeroIntro();
      return;
    }

    if (
      !heroMedia ||
      !heroPin ||
      !heroMediaSlot ||
      heroMedia.classList.contains("is-empty") ||
      announcement.hidden
    ) {
      heroStage.style.setProperty("--hero-progress", "1");
      clearHeroScrubStyles();
      return;
    }

    // After the first zoom completes, stay settled forever (no re-zoom on scroll up).
    if (heroIntroDone) {
      heroStage.style.setProperty("--hero-progress", "1");
      clearHeroScrubStyles();
      return;
    }

    // Freeze the scrub range on first use: the mobile URL bar collapsing
    // mid-scroll changes innerHeight, and a moving denominator makes the
    // zoom visibly jump while scrolling down.
    if (heroIntroRange <= 0) {
      heroIntroRange = heroStage.offsetHeight - stableViewportHeight();
    }
    const range = heroIntroRange;
    const stageTop = heroStage.getBoundingClientRect().top;
    // Finish the zoom/reveal, then hold. Mobile landscape gets a longer hold.
    const mobileLandscape =
      heroStage.classList.contains("is-landscape") &&
      window.matchMedia("(max-width: 959px)").matches;
    const SCRUB_END = mobileLandscape ? 0.58 : 0.78;
    const raw = range <= 0 ? 1 : clamp01(-stageTop / range);
    // One-way scrub: keep the furthest progress reached so scrolling back
    // up never replays the full-bleed zoom (it's a page-load-only effect).
    const progress = Math.max(
      raw >= SCRUB_END ? 1 : clamp01(raw / SCRUB_END),
      heroMaxProgress
    );
    heroMaxProgress = progress;
    heroStage.style.setProperty("--hero-progress", String(progress));

    if (progress >= 0.995) {
      settleHeroIntro();
      return;
    }

    const pinRect = heroPin.getBoundingClientRect();

    if (!ensureHeroSlotSize()) {
      // Still show a full-bleed cover so landscape never looks blank.
      heroMedia.classList.add("is-scrubbing");
      heroMedia.style.left = pinRect.left + "px";
      heroMedia.style.top = pinRect.top + "px";
      heroMedia.style.width = pinRect.width + "px";
      heroMedia.style.height = pinRect.height + "px";
      return;
    }

    const endRect = heroMediaSlot.getBoundingClientRect();
    const endW = endRect.width > 2 ? endRect.width : heroEndSize.w;
    const endH = endRect.height > 2 ? endRect.height : heroEndSize.h;
    // Center a zero-ish slot using computed size inside the pin.
    const endLeft =
      endRect.width > 2
        ? endRect.left
        : pinRect.left + (pinRect.width - endW) / 2;
    const endTop =
      endRect.height > 2
        ? endRect.top
        : pinRect.top + (pinRect.height - endH) / 2;

    const left = lerp(pinRect.left, endLeft, progress);
    const top = lerp(pinRect.top, endTop, progress);
    const width = lerp(pinRect.width, endW, progress);
    const height = lerp(pinRect.height, endH, progress);

    // Keep object-fit: cover the whole way — the end frame matches the
    // image's aspect ratio, so the crop eases to zero instead of snapping
    // to contain partway through (that snap read as a "jump").
    heroMedia.classList.add("is-scrubbing");
    heroMedia.style.left = left + "px";
    heroMedia.style.top = top + "px";
    heroMedia.style.width = width + "px";
    heroMedia.style.height = height + "px";
  }

  function scheduleHeroScrub() {
    if (heroScrubRaf) return;
    heroScrubRaf = window.requestAnimationFrame(() => {
      heroScrubRaf = 0;
      applyHeroScrub();
    });
  }

  let lastViewportW = window.innerWidth;
  let lastViewportH = window.innerHeight;

  function onHeroScrubResize() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // Mobile URL bar show/hide fires resize while scrolling: same width,
    // small height delta. Re-measuring the hero for those makes it change
    // size mid-scroll, so keep everything as-is and just re-run the scrub.
    const toolbarNudge =
      vw === lastViewportW && Math.abs(vh - lastViewportH) < 200;
    lastViewportW = vw;
    lastViewportH = vh;

    // Mid-scrub: keep the cached end size and just re-lerp to the new pin/slot
    // (clearing fixed for a remeasure causes the scroll-off / jump-back glitch).
    if (
      heroMedia &&
      heroMedia.classList.contains("is-scrubbing") &&
      heroEndSize
    ) {
      heroMediaSlot.style.width = heroEndSize.w + "px";
      heroMediaSlot.style.height = heroEndSize.h + "px";
      syncLandscapeStackWidth(heroEndSize);
      scheduleHeroScrub();
      return;
    }
    if (toolbarNudge) {
      scheduleHeroScrub();
      return;
    }
    if (!heroIntroDone) heroIntroRange = 0;
    clearHeroScrubStyles();
    clearHeroSlotSize();
    ensureHeroSlotSize();
    applyHeroScrub();
  }

  window.addEventListener("scroll", scheduleHeroScrub, { passive: true });
  window.addEventListener("resize", onHeroScrubResize);
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", onHeroScrubResize);
  }
  if (typeof reduceMotionQuery.addEventListener === "function") {
    reduceMotionQuery.addEventListener("change", onHeroScrubResize);
  } else if (typeof reduceMotionQuery.addListener === "function") {
    reduceMotionQuery.addListener(onHeroScrubResize);
  }

  async function render(data, options) {
    const isDemo = Boolean(options && options.demo);
    const isPreview = previewMode();
    assetVersion = (data && (data.updatedAt || data.v)) || "";

    // Root URL: blank until data.live (waits on GitHub Pages after admin save)
    if (requiresPublicLive() && !isDemo && !data.live) {
      showBlank();
      return;
    }

    if (!hasAnnouncement(data)) {
      // Keep showing the announcement if we already revealed it (e.g. brief
      // empty preview payloads / flaky reloads must not flash Coming soon).
      if (announcementRevealed) return;
      showComingSoon();
      return;
    }

    announcementRevealed = true;
    setRootEmptyState(false);
    comingSoon.hidden = true;
    // Keep announcement in the layout (not [hidden]/display:none) so iOS Safari
    // can load the hero; is-booting only hides it visually + locks scroll.
    announcement.hidden = false;
    if (!isPreview) setBooting(true);

    firstNameEl.textContent = data.firstName.trim();
    middleLastEl.textContent = String(data.middleLast || "").trim();
    middleLastEl.hidden = !middleLastEl.textContent;
    buildDetails(data);
    document.title = "A New Arrival";

    const hero = normalizePhoto(data.hero);
    const orientClasses = ["is-portrait", "is-landscape", "is-square"];
    heroMedia.classList.remove("is-empty", ...orientClasses);
    if (heroStage) heroStage.classList.remove(...orientClasses);

    const photos = (data.photos || []).map(normalizePhoto).filter(Boolean);
    const photosPromise = Promise.all(photos.map(ensureOrient));

    if (hero && hero.src) {
      const resolved = await ensureOrient(hero);
      const orient = resolved.orient || "portrait";
      heroMedia.classList.add("is-" + orient);
      if (heroStage) heroStage.classList.add("is-" + orient);
      heroImage.classList.remove("is-loaded");
      heroImage.alt = data.firstName.trim();
      // Phones pick the smaller hero file; big screens get the larger one.
      if (resolved.full && resolved.width && resolved.fullWidth) {
        heroImage.srcset =
          resolved.src +
          " " +
          resolved.width +
          "w, " +
          resolved.full +
          " " +
          resolved.fullWidth +
          "w";
        heroImage.sizes =
          orient === "landscape"
            ? "(min-width: 960px) 64rem, 100vw"
            : "(min-width: 960px) 46rem, 100vw";
      } else {
        heroImage.removeAttribute("srcset");
        heroImage.removeAttribute("sizes");
      }
      heroImage.src = resolved.src;
      await waitForHeroImage();
      heroImage.classList.add("is-loaded");
    } else {
      heroMedia.classList.add("is-empty");
      heroImage.removeAttribute("src");
      clearHeroScrubStyles();
      clearHeroSlotSize();
      if (heroStage) heroStage.style.setProperty("--hero-progress", "1");
    }

    if (!isPreview) setBooting(false);

    const resolvedPhotos = await photosPromise;
    paintGalleries(resolvedPhotos);

    window.requestAnimationFrame(() => {
      // Stage height may have changed with the hero orientation class.
      if (!heroIntroDone) heroIntroRange = 0;
      clearHeroScrubStyles();
      clearHeroSlotSize();
      ensureHeroSlotSize();
      applyHeroScrub();
    });
  }

  window.addEventListener("resize", () => {
    if (!cachedGalleryPhotos) return;
    const multi = allowMultiColumnLayout();
    if (multi === lastMultiColumnPref) return;
    paintGalleries(cachedGalleryPhotos);
  });

  // <base href="/announcement/"> would turn href="#gallery-a" into
  // /announcement/#gallery-a — keep scroll on the current URL (incl. root).
  const scrollHint = document.querySelector(".scroll-hint");
  if (scrollHint) {
    scrollHint.addEventListener("click", (event) => {
      event.preventDefault();
      const target = document.getElementById("gallery-a");
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  }

  // Preview: /announcement/#demo or #demo-landscape
  const DEMO_PHOTOS = [
    { src: "../alex/IMG_3591.jpeg", orient: "portrait" },
    { src: "../alex/IMG_3613.jpeg", orient: "portrait" },
    { src: "../alex/IMG_3534.jpeg", orient: "landscape" },
    { src: "../alex/IMG_4603.jpeg", orient: "portrait" },
    { src: "../IMG_3522.jpeg", orient: "portrait" },
    { src: "../alex/IMG_3600.jpeg", orient: "landscape" },
    { src: "../IMG_3528.jpeg", orient: "portrait" },
    { src: "../IMG_3575.jpeg", orient: "portrait" },
    { src: "../IMG_3478.jpeg", orient: "landscape" },
    { src: "../IMG_3463.jpeg", orient: "portrait" },
    { src: "../IMG_3482.jpeg", orient: "portrait" },
    { src: "../IMG_3421.jpeg", orient: "landscape" },
  ];

  function demoData(heroLandscape) {
    return {
      live: true,
      firstName: "Clara",
      middleLast: "Elodie Davyson",
      date: "31.07.2026",
      time: "11:37 am",
      weightKg: "3.225kg",
      weightLbOz: "7lbs 2oz",
      hero: heroLandscape
        ? { src: "../alex/IMG_3534.jpeg", orient: "landscape" }
        : { src: "../alex/IMG_4812.jpeg", orient: "portrait" },
      photos: DEMO_PHOTOS,
    };
  }

  function demoMode() {
    const params = new URLSearchParams(window.location.search);
    const demoParam = params.has("demo") ? params.get("demo") : null;
    const hash = (window.location.hash || "").replace(/^#/, "").toLowerCase();

    if (
      demoParam === "landscape" ||
      hash === "demo-landscape" ||
      hash === "demolandscape"
    ) {
      return "landscape";
    }
    if (
      params.has("demo") &&
      (demoParam === null ||
        demoParam === "" ||
        demoParam === "1" ||
        demoParam === "true" ||
        demoParam === "portrait")
    ) {
      return "portrait";
    }
    if (hash === "demo" || hash === "demo-portrait") {
      return "portrait";
    }
    return null;
  }

  // Admin live preview: /announcement/?preview=1 (iframe + postMessage)
  function previewMode() {
    const params = new URLSearchParams(window.location.search);
    return params.has("preview");
  }

  function acceptPreviewMessage(event) {
    if (window.parent && event.source !== window.parent) return;
    if (
      event.origin &&
      event.origin !== "null" &&
      event.origin !== window.location.origin
    ) {
      return;
    }
    const msg = event.data;
    if (!msg || msg.type !== "baby-preview" || !msg.data) return;
    render(msg.data, { demo: true });
  }

  const demo = demoMode();
  if (previewMode()) {
    document.documentElement.classList.add("is-preview");
    setBooting(false);
    window.addEventListener("message", acceptPreviewMessage);
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: "baby-preview-ready" }, "*");
    }
  } else if (demo) {
    render(demoData(demo === "landscape"), { demo: true });
  } else {
    // The head bootstrap starts this fetch (and the hero preload) before
    // this script parses; fall back to fetching here if it's absent.
    const dataPromise =
      window.__announcementData ||
      fetch("data.json?t=" + Date.now(), { cache: "no-store" }).then((res) => {
        if (!res.ok) throw new Error("Failed to load data.json");
        return res.json();
      });
    dataPromise
      .then((data) => render(data))
      .catch(() => {
        // Stay blank — never flash Coming soon on a load/network hiccup.
        showBlank();
      });
  }
})();
