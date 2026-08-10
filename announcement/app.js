(function () {
  // Assets load from GitHub Pages (repo stays private — no public raw URLs).
  const comingSoon = document.getElementById("coming-soon");
  const announcement = document.getElementById("announcement");
  const heroStage = document.querySelector(".hero-stage");
  const heroMedia = document.getElementById("hero-media");
  const heroImage = document.getElementById("hero-image");
  const firstNameEl = document.getElementById("first-name");
  const middleLastEl = document.getElementById("middle-last");
  const detailsEl = document.getElementById("details");
  const galleryA = document.getElementById("gallery-a");
  const galleryB = document.getElementById("gallery-b");

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

  function showBlank() {
    if (comingSoon) comingSoon.hidden = true;
    if (announcement) announcement.hidden = true;
    document.title = "";
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

  function createGalleryItem(photo) {
    const figure = document.createElement("figure");
    figure.className =
      "mosaic-item is-" + (photo.orient || "portrait");

    const img = document.createElement("img");
    img.src = photo.src;
    img.alt = "";
    img.loading = "lazy";
    img.decoding = "async";

    figure.appendChild(img);
    return figure;
  }

  function isPortraitish(orient) {
    return orient === "portrait" || orient === "square";
  }

  function allowTrioLayout() {
    return window.matchMedia("(min-width: 640px)").matches;
  }

  /** Pack photos into mosaic bricks: wide / duo / feature / trio */
  function buildMosaic(photos, allowTrio) {
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
      if (portraitCount % 6 === 0) {
        rows.push({ type: "feature", photos: [current] });
        i += 1;
        continue;
      }

      const next = photos[i + 1];
      const third = photos[i + 2];
      const nextPort = next && isPortraitish(next.orient);
      const thirdPort = third && isPortraitish(third.orient);

      if (allowTrio && nextPort && thirdPort) {
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

  function renderGallery(container, photos) {
    container.replaceChildren();
    container.classList.add("mosaic");
    if (!photos.length) return;

    const rows = buildMosaic(photos, allowTrioLayout());
    rows.forEach((row) => {
      const rowEl = document.createElement("div");
      rowEl.className = "mosaic-row " + row.type;
      row.photos.forEach((photo) => {
        rowEl.appendChild(createGalleryItem(photo));
      });
      container.appendChild(rowEl);
    });
  }

  function observeGallery() {
    const rows = document.querySelectorAll(".mosaic-row");
    if (!("IntersectionObserver" in window)) {
      rows.forEach((row) => row.classList.add("is-visible"));
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 }
    );
    rows.forEach((row) => observer.observe(row));
  }

  /** @type {any[] | null} */
  let cachedGalleryPhotos = null;
  let lastTrioPref = allowTrioLayout();

  function paintGalleries(photos) {
    cachedGalleryPhotos = photos;
    lastTrioPref = allowTrioLayout();
    const midpoint = Math.ceil(photos.length / 2);
    renderGallery(galleryA, photos.slice(0, midpoint));
    renderGallery(galleryB, photos.slice(midpoint));
    observeGallery();
  }

  function showComingSoon() {
    comingSoon.hidden = false;
    announcement.hidden = true;
    document.title = "A New Arrival";
  }

  async function render(data, options) {
    const isDemo = Boolean(options && options.demo);
    assetVersion = (data && (data.updatedAt || data.v)) || "";

    // Root URL: blank until data.live (waits on GitHub Pages after admin save)
    if (requiresPublicLive() && !isDemo && !data.live) {
      showBlank();
      return;
    }

    if (!hasAnnouncement(data)) {
      showComingSoon();
      return;
    }

    comingSoon.hidden = true;
    announcement.hidden = false;

    firstNameEl.textContent = data.firstName.trim();
    middleLastEl.textContent = String(data.middleLast || "").trim();
    middleLastEl.hidden = !middleLastEl.textContent;
    buildDetails(data);
    document.title = data.firstName.trim() + " — A New Arrival";

    const hero = normalizePhoto(data.hero);
    const orientClasses = ["is-portrait", "is-landscape", "is-square"];
    heroMedia.classList.remove("is-empty", ...orientClasses);
    if (heroStage) heroStage.classList.remove(...orientClasses);

    if (hero && hero.src) {
      const resolved = await ensureOrient(hero);
      const orient = resolved.orient || "portrait";
      heroMedia.classList.add("is-" + orient);
      if (heroStage) heroStage.classList.add("is-" + orient);
      heroImage.classList.remove("is-loaded");
      heroImage.src = resolved.src;
      heroImage.alt = data.firstName.trim();
      heroImage.onload = () => heroImage.classList.add("is-loaded");
      if (heroImage.complete) heroImage.classList.add("is-loaded");
    } else {
      heroMedia.classList.add("is-empty");
      heroImage.removeAttribute("src");
    }

    const photos = (data.photos || []).map(normalizePhoto).filter(Boolean);

    const resolvedPhotos = await Promise.all(photos.map(ensureOrient));
    paintGalleries(resolvedPhotos);
  }

  window.addEventListener("resize", () => {
    if (!cachedGalleryPhotos) return;
    const trio = allowTrioLayout();
    if (trio === lastTrioPref) return;
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

  const demo = demoMode();
  if (demo) {
    render(demoData(demo === "landscape"), { demo: true });
  } else {
    fetch("data.json?t=" + Date.now(), { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load data.json");
        return res.json();
      })
      .then((data) => render(data))
      .catch(() => showComingSoon());
  }
})();
