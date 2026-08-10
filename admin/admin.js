(function () {
  const OWNER = "davysoncom";
  const REPO = "baby";
  const BRANCH = "main";
  const DATA_PATH = "announcement/data.json";
  const PHOTOS_PREFIX = "announcement/photos/";
  const TOKEN_KEY = "babyAdminToken";
  // Keep uploads small enough for iOS Safari → GitHub Contents API
  // (large PUTs often fail there as a red "Load failed").
  const MAX_EDGE = 1920;
  const JPEG_QUALITY = 0.82;
  const MAX_UPLOAD_BYTES = 2.2 * 1024 * 1024;
  const UPLOAD_SIZE_STEPS = [
    MAX_UPLOAD_BYTES,
    1.4 * 1024 * 1024,
    950 * 1024,
  ];

  const form = document.getElementById("admin-form");
  const tokenBox = document.getElementById("token-box");
  const tokenSummary = document.getElementById("token-summary");
  const tokenSummaryActionLabel = tokenSummary
    ? tokenSummary.querySelector(".token-summary-action-label")
    : null;
  const tokenInput = document.getElementById("token");
  const tokenLabel = document.getElementById("token-label");
  const tokenStatus = document.getElementById("token-status");
  const clearTokenBtn = document.getElementById("clear-token");
  const clearPhotosBtn = document.getElementById("clear-photos");
  const statusEl = document.getElementById("status");
  const saveBtn = document.getElementById("save");
  const goLiveBtn = document.getElementById("go-live");
  const unpublishBtn = document.getElementById("unpublish");
  const liveStatus = document.getElementById("live-status");
  const heroPreview = document.getElementById("hero-preview");
  const photoList = document.getElementById("photo-list");
  const previewFrame = document.getElementById("page-preview");
  const previewSync = document.getElementById("preview-sync");
  const modeEditBtn = document.getElementById("mode-edit");
  const modePreviewBtn = document.getElementById("mode-preview");
  const openPreviewMobileBtn = document.getElementById("open-preview-mobile");

  /** When a token is saved, details stay collapsed until the user expands. */
  let tokenExpanded = false;

  /** @type {any} */
  let data = {
    live: false,
    firstName: "",
    middleLast: "",
    date: "",
    time: "",
    weightKg: "",
    weightLbOz: "",
    hero: { src: "", orient: "portrait" },
    photos: [],
  };

  /** Pending local files shown in preview before Save. */
  let pendingHeroUrl = "";
  let pendingHeroOrient = "";
  /** @type {{ src: string, orient: string }[]} */
  let pendingGallery = [];
  let previewReady = false;
  let previewTimer = 0;
  let dataSha = "";

  function getToken() {
    return (
      localStorage.getItem(TOKEN_KEY) ||
      String(tokenInput.value || "").trim()
    );
  }

  function refreshTokenUi() {
    const saved = Boolean(localStorage.getItem(TOKEN_KEY));
    if (!saved) tokenExpanded = false;

    const collapsed = saved && !tokenExpanded;

    if (tokenBox) {
      tokenBox.classList.toggle("has-saved-token", saved);
      tokenBox.classList.toggle("is-collapsed", collapsed);
    }

    if (tokenSummary) {
      tokenSummary.hidden = !saved;
      tokenSummary.setAttribute("aria-expanded", String(saved && tokenExpanded));
    }

    if (tokenSummaryActionLabel) {
      tokenSummaryActionLabel.textContent = tokenExpanded ? "Hide" : "Change";
    }

    if (saved) {
      tokenStatus.textContent = "Token saved on this phone.";
      tokenStatus.classList.add("ok");
      // Collapsed: no input. Expanded: allow paste to replace without clearing first.
      tokenLabel.hidden = collapsed;
      if (collapsed) tokenInput.value = "";
    } else {
      tokenStatus.textContent = "No token saved yet.";
      tokenStatus.classList.remove("ok");
      tokenLabel.hidden = false;
    }
  }

  function setStatus(message, kind) {
    statusEl.textContent = message || "";
    statusEl.classList.remove("ok", "error");
    if (kind) statusEl.classList.add(kind);
  }

  function isTransientNetworkError(err) {
    if (!err) return false;
    if (err.cause && err.cause !== err && isTransientNetworkError(err.cause)) {
      return true;
    }
    const msg = String(err.message || err);
    // WebKit/iOS uses TypeError "Load failed" for many fetch failures.
    return (
      err.name === "TypeError" ||
      /load failed/i.test(msg) ||
      /failed to fetch/i.test(msg) ||
      /networkerror/i.test(msg) ||
      /network request failed/i.test(msg) ||
      /upload failed \(network\)/i.test(msg)
    );
  }

  function formatAdminError(err) {
    const msg = (err && err.message) || String(err || "Unknown error");
    if (isTransientNetworkError(err) || /load failed/i.test(msg)) {
      return (
        "Upload failed (network). Try Save again on a stable connection — if it keeps failing on iPhone, use fewer photos per save."
      );
    }
    return msg;
  }

  function field(id) {
    return document.getElementById(id);
  }

  function parseKgInput(text) {
    const match = String(text || "")
      .trim()
      .replace(",", ".")
      .match(/(\d+(?:\.\d+)?)/);
    if (!match) return NaN;
    const kg = parseFloat(match[1]);
    return Number.isFinite(kg) && kg > 0 ? kg : NaN;
  }

  function kgToLbOz(kg) {
    const totalPounds = kg * 2.2046226218;
    let lbs = Math.floor(totalPounds);
    let oz = Math.round((totalPounds - lbs) * 16);
    if (oz === 16) {
      lbs += 1;
      oz = 0;
    }
    return { lbs: lbs, oz: oz, label: lbs + "lbs " + oz + "oz" };
  }

  function refreshWeightAdvice() {
    const adviceText = document.getElementById("weight-advice-text");
    const useBtn = document.getElementById("weight-advice-use");
    if (!adviceText || !useBtn) return;

    const kg = parseKgInput(field("weightKg").value);
    if (!Number.isFinite(kg)) {
      adviceText.innerHTML = "Enter kg for a lbs/oz suggestion.";
      useBtn.hidden = true;
      useBtn.dataset.suggestion = "";
      return;
    }

    const converted = kgToLbOz(kg);
    const current = String(field("weightLbOz").value || "").trim();
    const matches =
      current.replace(/\s+/g, " ").toLowerCase() ===
      converted.label.toLowerCase();

    adviceText.innerHTML =
      "From kg → about <strong>" +
      converted.label +
      "</strong>" +
      (matches ? " (matches the field)." : ".");
    useBtn.hidden = matches;
    useBtn.dataset.suggestion = converted.label;
  }

  function assetPreviewUrl(src) {
    if (!src) return "";
    if (/^(https?:|blob:|data:)/i.test(src)) return src;
    const rel = String(src)
      .replace(/^announcement\//, "")
      .replace(/^\.\//, "");
    const bust = data.updatedAt ? "?v=" + encodeURIComponent(data.updatedAt) : "";
    return "../announcement/" + rel + bust;
  }

  function absoluteAssetUrl(src) {
    const rel = assetPreviewUrl(src);
    if (!rel) return "";
    try {
      return new URL(rel, window.location.href).href;
    } catch (_) {
      return rel;
    }
  }

  function revokeUrl(url) {
    if (url && String(url).startsWith("blob:")) {
      try {
        URL.revokeObjectURL(url);
      } catch (_) {
        /* ignore */
      }
    }
  }

  function clearPendingHero() {
    revokeUrl(pendingHeroUrl);
    pendingHeroUrl = "";
    pendingHeroOrient = "";
  }

  function clearPendingGallery() {
    pendingGallery.forEach((p) => revokeUrl(p.src));
    pendingGallery = [];
  }

  function readImageOrient(file) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const orient = orientOf(img.naturalWidth, img.naturalHeight);
        URL.revokeObjectURL(url);
        resolve(orient);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve("portrait");
      };
      img.src = url;
    });
  }

  function buildPreviewData() {
    const firstName = field("firstName").value.trim();
    const middleLast = field("middleLast").value.trim();
    const date = field("date").value.trim();
    const time = field("time").value.trim();
    const weightKg = field("weightKg").value.trim();
    const weightLbOz = field("weightLbOz").value.trim();

    let heroSrc = "";
    let heroOrient = "portrait";
    if (pendingHeroUrl) {
      heroSrc = pendingHeroUrl;
      heroOrient = pendingHeroOrient || "portrait";
    } else if (data.hero && data.hero.src) {
      heroSrc = absoluteAssetUrl(data.hero.src);
      heroOrient = data.hero.orient || "portrait";
    }

    const photos = (data.photos || [])
      .map((photo) => {
        const src = typeof photo === "string" ? photo : photo && photo.src;
        if (!src) return null;
        return {
          src: absoluteAssetUrl(src),
          orient:
            typeof photo === "string" ? "" : (photo && photo.orient) || "",
        };
      })
      .filter(Boolean)
      .concat(pendingGallery);

    return {
      live: true,
      firstName: firstName,
      middleLast: middleLast,
      date: date,
      time: time,
      weightKg: weightKg,
      weightLbOz: weightLbOz,
      hero: { src: heroSrc, orient: heroOrient },
      photos: photos,
      updatedAt: Date.now(),
    };
  }

  function pushPreview() {
    if (!previewFrame || !previewFrame.contentWindow) return;
    if (!previewReady) return;
    previewFrame.contentWindow.postMessage(
      { type: "baby-preview", data: buildPreviewData() },
      window.location.origin
    );
    if (previewSync) previewSync.textContent = "Synced";
  }

  function schedulePreview() {
    if (previewSync) previewSync.textContent = "Updating…";
    window.clearTimeout(previewTimer);
    previewTimer = window.setTimeout(pushPreview, 120);
  }

  function setAdminMode(mode) {
    const isPreview = mode === "preview";
    document.body.classList.toggle("is-preview", isPreview);
    document.body.classList.toggle("is-edit", !isPreview);
    if (modeEditBtn) modeEditBtn.setAttribute("aria-pressed", String(!isPreview));
    if (modePreviewBtn) {
      modePreviewBtn.setAttribute("aria-pressed", String(isPreview));
    }
    if (isPreview) schedulePreview();
  }

  function renderPhotoThumb(src, orient, onRemove) {
    const card = document.createElement("div");
    card.className = "photo-card";

    const img = document.createElement("img");
    img.src = assetPreviewUrl(src);
    img.alt = "";
    img.loading = "lazy";

    const meta = document.createElement("div");
    meta.className = "photo-meta";
    meta.textContent = orient || "photo";

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "remove-photo";
    removeBtn.textContent = "Remove";
    removeBtn.addEventListener("click", onRemove);

    card.appendChild(img);
    card.appendChild(removeBtn);
    card.appendChild(meta);
    return card;
  }

  function fillForm() {
    field("firstName").value = data.firstName || "";
    field("middleLast").value = data.middleLast || "";
    field("date").value = data.date || "";
    field("time").value = data.time || "";
    field("weightKg").value = data.weightKg || "";
    field("weightLbOz").value = data.weightLbOz || "";
    refreshWeightAdvice();

    heroPreview.replaceChildren();
    const heroSrc = pendingHeroUrl || (data.hero && data.hero.src) || "";
    if (heroSrc) {
      const img = document.createElement("img");
      img.src = pendingHeroUrl || assetPreviewUrl(data.hero.src);
      img.alt = "Current hero";
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "remove-photo";
      removeBtn.textContent = "Remove";
      removeBtn.addEventListener("click", () => {
        clearPendingHero();
        data.hero = { src: "", orient: "portrait" };
        field("heroFile").value = "";
        fillForm();
        setStatus("Hero removed in the form. Save to publish.", "ok");
      });
      heroPreview.appendChild(img);
      heroPreview.appendChild(removeBtn);
    }

    photoList.replaceChildren();
    const photos = data.photos || [];
    const savedCount = photos.length;
    const pendingCount = pendingGallery.length;
    if (!savedCount && !pendingCount) {
      const empty = document.createElement("p");
      empty.className = "photo-empty";
      empty.textContent = "No gallery photos yet.";
      photoList.appendChild(empty);
      schedulePreview();
      return;
    }
    photos.forEach((photo, index) => {
      const src = typeof photo === "string" ? photo : photo.src;
      const orient = typeof photo === "string" ? "" : photo.orient || "";
      photoList.appendChild(
        renderPhotoThumb(src, orient, () => {
          data.photos.splice(index, 1);
          fillForm();
          setStatus("Photo removed in the form. Save to publish.", "ok");
        })
      );
    });
    pendingGallery.forEach((photo, index) => {
      photoList.appendChild(
        renderPhotoThumb(photo.src, photo.orient || "new", () => {
          revokeUrl(photo.src);
          pendingGallery.splice(index, 1);
          field("photoFiles").value = "";
          fillForm();
          setStatus("Pending photo removed from preview.", "ok");
        })
      );
    });
    schedulePreview();
  }

  function apiHeaders(token, withJsonBody) {
    const headers = {
      Accept: "application/vnd.github+json",
      Authorization: "Bearer " + token,
      "X-GitHub-Api-Version": "2022-11-28",
    };
    if (withJsonBody) headers["Content-Type"] = "application/json";
    return headers;
  }

  function delay(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  async function githubFetch(url, options, attempt) {
    const tryNumber = attempt || 0;
    try {
      return await fetch(url, options);
    } catch (err) {
      if (tryNumber < 4 && isTransientNetworkError(err)) {
        await delay(350 * Math.pow(2, tryNumber));
        return githubFetch(url, options, tryNumber + 1);
      }
      const wrapped = new Error(formatAdminError(err));
      wrapped.cause = err;
      throw wrapped;
    }
  }

  async function githubGet(path, token) {
    const url =
      "https://api.github.com/repos/" +
      OWNER +
      "/" +
      REPO +
      "/contents/" +
      path +
      "?ref=" +
      encodeURIComponent(BRANCH) +
      "&_=" +
      Date.now();
    const res = await githubFetch(url, {
      headers: apiHeaders(token, false),
      cache: "no-store",
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      const body = await res.text();
      throw new Error("GitHub GET " + path + " failed: " + res.status + " " + body);
    }
    return res.json();
  }

  async function githubPut(path, contentBase64, message, token, sha, attempt) {
    const tryNumber = attempt || 0;
    const url =
      "https://api.github.com/repos/" +
      OWNER +
      "/" +
      REPO +
      "/contents/" +
      path;
    const payload = {
      message: message,
      content: contentBase64,
      branch: BRANCH,
    };
    if (sha) payload.sha = sha;
    let res;
    try {
      res = await githubFetch(url, {
        method: "PUT",
        headers: apiHeaders(token, true),
        body: JSON.stringify(payload),
      });
    } catch (err) {
      // githubFetch already retried; one more full PUT attempt after a pause
      // helps flaky cellular uploads of photo payloads.
      if (tryNumber < 2 && isTransientNetworkError(err)) {
        await delay(800 * (tryNumber + 1));
        return githubPut(
          path,
          contentBase64,
          message,
          token,
          sha,
          tryNumber + 1
        );
      }
      throw err;
    }
    // 409 = SHA race (photo commits, overlapping saves, or mobile double-tap).
    // Back off, re-read the latest SHA, and retry.
    if (res.status === 409 && tryNumber < 6) {
      await delay(200 * Math.pow(2, tryNumber));
      const fresh = await githubGet(path, token);
      if (!fresh || !fresh.sha) {
        throw new Error(
          "GitHub PUT " +
            path +
            " conflicted and the file SHA could not be refreshed. Try Save again."
        );
      }
      return githubPut(
        path,
        contentBase64,
        message,
        token,
        fresh.sha,
        tryNumber + 1
      );
    }
    if (res.status === 422 && tryNumber < 6) {
      const body = await res.text();
      if (/sha/i.test(body)) {
        await delay(200 * Math.pow(2, tryNumber));
        const fresh = await githubGet(path, token);
        if (!fresh || !fresh.sha) {
          throw new Error(
            "GitHub PUT " +
              path +
              " needs the latest file SHA, but it could not be refreshed. Try Save again."
          );
        }
        return githubPut(
          path,
          contentBase64,
          message,
          token,
          fresh.sha,
          tryNumber + 1
        );
      }
      throw new Error("GitHub PUT " + path + " failed: " + res.status + " " + body);
    }
    if (!res.ok) {
      const body = await res.text();
      throw new Error("GitHub PUT " + path + " failed: " + res.status + " " + body);
    }
    return res.json();
  }

  function bytesToBase64(bytes) {
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(
        null,
        bytes.subarray(i, i + chunk)
      );
    }
    return btoa(binary);
  }

  function textToBase64(text) {
    return btoa(unescape(encodeURIComponent(text)));
  }

  function orientOf(width, height) {
    if (!width || !height) return "portrait";
    const ratio = width / height;
    if (ratio > 1.05) return "landscape";
    if (ratio < 0.95) return "portrait";
    return "square";
  }

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(
          new Error(
            "Could not read image. If it’s a HEIC/Live Photo, try exporting as JPEG first."
          )
        );
      };
      img.src = url;
    });
  }

  function canvasToJpegBlob(canvas, quality) {
    return new Promise((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality)
    );
  }

  async function compressImage(file, options) {
    const maxUploadBytes =
      (options && options.maxUploadBytes) || MAX_UPLOAD_BYTES;
    const minQuality = (options && options.minQuality) || 0.5;
    const minEdgeCap = (options && options.minEdgeCap) || 900;
    const img = await loadImage(file);
    const orient = orientOf(img.naturalWidth, img.naturalHeight);
    let width = img.naturalWidth || 1;
    let height = img.naturalHeight || 1;
    let maxEdgeCap = MAX_EDGE;
    let quality = JPEG_QUALITY;

    const encode = async () => {
      let w = width;
      let h = height;
      const maxEdge = Math.max(w, h);
      if (maxEdge > maxEdgeCap) {
        const scale = maxEdgeCap / maxEdge;
        w = Math.max(1, Math.round(w * scale));
        h = Math.max(1, Math.round(h * scale));
      }
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Image compression failed");
      ctx.drawImage(img, 0, 0, w, h);
      return canvasToJpegBlob(canvas, quality);
    };

    let blob = await encode();
    // Shrink until the GitHub PUT body is safe for mobile Safari.
    let guard = 0;
    while (
      blob &&
      blob.size > maxUploadBytes &&
      guard < 8 &&
      (quality > minQuality || maxEdgeCap > minEdgeCap)
    ) {
      guard += 1;
      if (quality > minQuality) quality = Math.max(minQuality, quality - 0.1);
      else maxEdgeCap = Math.round(maxEdgeCap * 0.8);
      blob = await encode();
    }
    if (!blob) throw new Error("Image compression failed");
    const buffer = new Uint8Array(await blob.arrayBuffer());
    return {
      base64: bytesToBase64(buffer),
      orient: orient,
      ext: "jpg",
      bytes: blob.size,
    };
  }

  async function uploadImageWithFallback(
    file,
    filePrefix,
    message,
    token,
    primaryStatus,
    retryLabel
  ) {
    const fileName = stampName(filePrefix, "jpg");
    const path = PHOTOS_PREFIX + fileName;
    const retryBaseLabel = retryLabel || "photo";
    let lastError = null;

    for (let i = 0; i < UPLOAD_SIZE_STEPS.length; i += 1) {
      const targetBytes = UPLOAD_SIZE_STEPS[i];
      const attemptNumber = i + 1;
      setStatus(
        i === 0
          ? primaryStatus + "…"
          : "Retrying " +
              retryBaseLabel +
              " with smaller upload (" +
              attemptNumber +
              "/" +
              UPLOAD_SIZE_STEPS.length +
              ")…"
      );
      const compressed = await compressImage(file, {
        maxUploadBytes: targetBytes,
      });
      try {
        const existing = await githubGet(path, token);
        await githubPut(
          path,
          compressed.base64,
          message,
          token,
          existing && existing.sha
        );
        return {
          src: "photos/" + fileName,
          orient: compressed.orient,
        };
      } catch (err) {
        lastError = err;
        const canRetry =
          i < UPLOAD_SIZE_STEPS.length - 1 && isTransientNetworkError(err);
        if (!canRetry) throw err;
        await delay(700 * (i + 1));
      }
    }

    throw lastError || new Error("Image upload failed");
  }

  function stampName(prefix, ext) {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const stamp =
      now.getFullYear() +
      pad(now.getMonth() + 1) +
      pad(now.getDate()) +
      "-" +
      pad(now.getHours()) +
      pad(now.getMinutes()) +
      pad(now.getSeconds()) +
      "-" +
      Math.random().toString(36).slice(2, 6);
    return prefix + stamp + "." + ext;
  }

  function decodeGithubContent(file) {
    if (!file || !file.content) return "";
    return decodeURIComponent(escape(atob(file.content.replace(/\n/g, ""))));
  }

  async function loadData() {
    // Prefer live file from Pages/raw for prefill when no token yet
    try {
      const local = await fetch("../announcement/data.json", {
        cache: "no-store",
      });
      if (local.ok) {
        data = await local.json();
        fillForm();
        return;
      }
    } catch (_) {
      /* fall through */
    }

    const token = getToken();
    if (!token) {
      fillForm();
      return;
    }

    const file = await githubGet(DATA_PATH, token);
    if (file && file.content) {
      dataSha = file.sha || "";
      data = JSON.parse(decodeGithubContent(file));
    }
    fillForm();
  }

  if (tokenSummary) {
    tokenSummary.addEventListener("click", () => {
      if (!localStorage.getItem(TOKEN_KEY)) return;
      tokenExpanded = !tokenExpanded;
      refreshTokenUi();
      if (tokenExpanded) {
        window.setTimeout(() => {
          try {
            tokenInput.focus({ preventScroll: true });
          } catch (_) {
            tokenInput.focus();
          }
        }, 0);
      }
    });
  }

  clearTokenBtn.addEventListener("click", () => {
    localStorage.removeItem(TOKEN_KEY);
    tokenInput.value = "";
    tokenExpanded = false;
    refreshTokenUi();
    setStatus("Token cleared from this phone.", "ok");
  });

  clearPhotosBtn.addEventListener("click", () => {
    data.photos = [];
    clearPendingGallery();
    field("photoFiles").value = "";
    fillForm();
    setStatus("Gallery cleared in the form. Save to publish.", "ok");
  });

  field("weightKg").addEventListener("input", () => {
    refreshWeightAdvice();
    schedulePreview();
  });
  document.getElementById("weight-advice-use").addEventListener("click", () => {
    const suggestion =
      document.getElementById("weight-advice-use").dataset.suggestion || "";
    if (!suggestion) return;
    field("weightLbOz").value = suggestion;
    refreshWeightAdvice();
    schedulePreview();
  });

  ["firstName", "middleLast", "date", "time", "weightLbOz"].forEach((id) => {
    field(id).addEventListener("input", schedulePreview);
  });

  field("heroFile").addEventListener("change", async () => {
    const file = field("heroFile").files && field("heroFile").files[0];
    clearPendingHero();
    if (!file) {
      fillForm();
      return;
    }
    pendingHeroUrl = URL.createObjectURL(file);
    pendingHeroOrient = await readImageOrient(file);
    fillForm();
    setStatus("Hero ready in preview — Save to publish.", "ok");
  });

  field("photoFiles").addEventListener("change", async () => {
    const files = Array.from(field("photoFiles").files || []);
    if (!files.length) return;
    clearPendingGallery();
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const src = URL.createObjectURL(file);
      const orient = await readImageOrient(file);
      pendingGallery.push({ src: src, orient: orient });
    }
    fillForm();
    setStatus(
      files.length +
        " gallery photo" +
        (files.length === 1 ? "" : "s") +
        " ready in preview — Save to publish.",
      "ok"
    );
  });

  if (modeEditBtn) {
    modeEditBtn.addEventListener("click", () => setAdminMode("edit"));
  }
  if (modePreviewBtn) {
    modePreviewBtn.addEventListener("click", () => setAdminMode("preview"));
  }
  if (openPreviewMobileBtn) {
    openPreviewMobileBtn.addEventListener("click", () => setAdminMode("preview"));
  }

  window.addEventListener("message", (event) => {
    if (event.origin !== window.location.origin) return;
    if (!event.data || event.data.type !== "baby-preview-ready") return;
    previewReady = true;
    pushPreview();
  });

  if (previewFrame) {
    previewFrame.addEventListener("load", () => {
      // If the iframe reloads, wait for its ready ping (or nudge after a beat).
      previewReady = false;
      window.setTimeout(() => {
        if (!previewReady) {
          previewReady = true;
          pushPreview();
        }
      }, 400);
    });
  }

  function applyLiveStatus(isLive) {
    if (!liveStatus) return;
    if (isLive) {
      liveStatus.textContent = "Root is live (data.live = true).";
      liveStatus.classList.add("ok");
    } else {
      liveStatus.textContent = "Root is blank (data.live = false).";
      liveStatus.classList.remove("ok");
    }
  }

  async function refreshLiveStatus() {
    if (!liveStatus) return;
    try {
      const res = await fetch("../announcement/data.json?t=" + Date.now(), {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("data fetch failed");
      const remote = await res.json();
      data.live = Boolean(remote.live);
      applyLiveStatus(data.live);
    } catch (_) {
      applyLiveStatus(Boolean(data.live));
    }
  }

  async function ensureToken() {
    const typedToken = String(tokenInput.value || "").trim();
    if (typedToken) {
      localStorage.setItem(TOKEN_KEY, typedToken);
      tokenExpanded = false;
      refreshTokenUi();
    }
    const token = getToken();
    if (!token) {
      setStatus("Paste a GitHub token first.", "error");
      tokenExpanded = true;
      refreshTokenUi();
      return null;
    }
    return token;
  }

  function readFormFieldsIntoData() {
    data.firstName = field("firstName").value.trim();
    data.middleLast = field("middleLast").value.trim();
    data.date = field("date").value.trim();
    data.time = field("time").value.trim();
    data.weightKg = field("weightKg").value.trim();
    data.weightLbOz = field("weightLbOz").value.trim();
    if (!Array.isArray(data.photos)) data.photos = [];
    if (!data.hero || typeof data.hero === "string") {
      data.hero = {
        src: typeof data.hero === "string" ? data.hero : "",
        orient: "portrait",
      };
    }
  }

  async function getDataSha(token) {
    if (dataSha) return dataSha;
    const existingData = await githubGet(DATA_PATH, token);
    if (!existingData || !existingData.sha) {
      throw new Error(
        "Could not read the current data.json SHA from GitHub. Try Save again."
      );
    }
    dataSha = existingData.sha;
    return dataSha;
  }

  async function saveDataJson(token, message) {
    data.updatedAt = Date.now();
    const currentSha = await getDataSha(token);
    const json = JSON.stringify(data, null, 2) + "\n";
    const result = await githubPut(
      DATA_PATH,
      textToBase64(json),
      message,
      token,
      currentSha
    );
    dataSha = (result && result.content && result.content.sha) || dataSha;
  }

  async function saveDataJsonWithRetry(token, message, onRetry) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await saveDataJson(token, message);
        return;
      } catch (err) {
        const canRetry = attempt < 2 && isTransientNetworkError(err);
        if (!canRetry) throw err;
        if (typeof onRetry === "function") onRetry(attempt + 1);
        await delay(600 * (attempt + 1));
      }
    }
  }

  let saveInFlight = false;

  async function setLiveFlag(live) {
    if (saveInFlight) {
      setStatus("Wait for the current save to finish.", "error");
      return;
    }
    const token = await ensureToken();
    if (!token) return;
    saveInFlight = true;
    goLiveBtn.disabled = true;
    unpublishBtn.disabled = true;
    saveBtn.disabled = true;
    setStatus(live ? "Going live…" : "Unpublishing…");
    try {
      readFormFieldsIntoData();
      data.live = Boolean(live);
      await saveDataJsonWithRetry(
        token,
        live
          ? "Go live: set announcement data.live true"
          : "Unpublish: set announcement data.live false",
        (retryCount) => {
          setStatus(
            "Connection dropped while updating live flag — retrying (" +
              retryCount +
              "/3)…"
          );
        }
      );
      applyLiveStatus(data.live);
      setStatus(
        live
          ? "Live at baby.davyson.com — site updates in about a minute."
          : "Root blank again — site updates in about a minute.",
        "ok"
      );
    } catch (err) {
      console.error(err);
      setStatus(formatAdminError(err), "error");
    } finally {
      saveInFlight = false;
      goLiveBtn.disabled = false;
      unpublishBtn.disabled = false;
      saveBtn.disabled = false;
    }
  }

  goLiveBtn.addEventListener("click", () => setLiveFlag(true));
  unpublishBtn.addEventListener("click", () => setLiveFlag(false));

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (saveInFlight) return;
    setStatus("");

    const typedToken = String(tokenInput.value || "").trim();
    if (typedToken) {
      localStorage.setItem(TOKEN_KEY, typedToken);
      tokenExpanded = false;
      refreshTokenUi();
    }

    const token = getToken();
    if (!token) {
      setStatus("Paste a GitHub token first.", "error");
      tokenExpanded = true;
      refreshTokenUi();
      return;
    }

    saveInFlight = true;
    saveBtn.disabled = true;
    goLiveBtn.disabled = true;
    unpublishBtn.disabled = true;
    setStatus("Saving…");

    try {
      readFormFieldsIntoData();
      // Preserve live flag across ordinary saves
      data.live = Boolean(data.live);

      const heroFile = field("heroFile").files[0];
      if (heroFile) {
        const uploadedHero = await uploadImageWithFallback(
          heroFile,
          "hero-",
          "Update announcement hero photo",
          token,
          "Uploading hero photo",
          "hero photo"
        );
        data.hero = {
          src: uploadedHero.src,
          orient: uploadedHero.orient,
        };
      }

      const galleryFiles = Array.from(field("photoFiles").files || []);
      for (let i = 0; i < galleryFiles.length; i++) {
        const uploadedPhoto = await uploadImageWithFallback(
          galleryFiles[i],
          "photo-",
          "Add announcement gallery photo",
          token,
          "Uploading gallery photo " + (i + 1) + " of " + galleryFiles.length,
          "gallery photo " + (i + 1)
        );
        data.photos.push({
          src: uploadedPhoto.src,
          orient: uploadedPhoto.orient,
        });
      }

      setStatus("Updating data.json…");
      await saveDataJsonWithRetry(token, "Update announcement details", () => {
        setStatus("Network hiccup while saving data.json — retrying…");
      });

      clearPendingHero();
      clearPendingGallery();
      field("heroFile").value = "";
      field("photoFiles").value = "";
      fillForm();
      applyLiveStatus(Boolean(data.live));
      setStatus("Saved — site updates in about a minute.", "ok");
    } catch (err) {
      console.error(err);
      setStatus(formatAdminError(err), "error");
    } finally {
      saveInFlight = false;
      saveBtn.disabled = false;
      goLiveBtn.disabled = false;
      unpublishBtn.disabled = false;
    }
  });

  refreshTokenUi();
  refreshLiveStatus();
  loadData().catch((err) => {
    console.error(err);
    setStatus("Could not load current data. You can still fill and save.", "error");
    fillForm();
  });
})();
