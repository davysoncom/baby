(function () {
  const OWNER = "davysoncom";
  const REPO = "baby";
  const BRANCH = "main";
  const DATA_PATH = "announcement/data.json";
  const ROOT_INDEX_PATH = "index.html";
  const PHOTOS_PREFIX = "announcement/photos/";
  const TOKEN_KEY = "babyAdminToken";
  const MAX_EDGE = 1800;
  const JPEG_QUALITY = 0.82;
  const BLANK_ROOT_HTML = "";
  const ANN_INDEX_PATH = "announcement/index.html";

  const form = document.getElementById("admin-form");
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

  /** @type {any} */
  let data = {
    firstName: "",
    middleLast: "",
    date: "",
    time: "",
    weightKg: "",
    weightLbOz: "",
    hero: { src: "", orient: "portrait" },
    photos: [],
  };

  function getToken() {
    return (
      localStorage.getItem(TOKEN_KEY) ||
      String(tokenInput.value || "").trim()
    );
  }

  function refreshTokenUi() {
    const saved = localStorage.getItem(TOKEN_KEY);
    if (saved) {
      tokenStatus.textContent = "Token saved on this phone.";
      tokenStatus.classList.add("ok");
      tokenLabel.hidden = true;
      tokenInput.value = "";
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

  function fillForm() {
    field("firstName").value = data.firstName || "";
    field("middleLast").value = data.middleLast || "";
    field("date").value = data.date || "";
    field("time").value = data.time || "";
    field("weightKg").value = data.weightKg || "";
    field("weightLbOz").value = data.weightLbOz || "";
    refreshWeightAdvice();

    heroPreview.replaceChildren();
    if (data.hero && data.hero.src) {
      const img = document.createElement("img");
      // Paths in data are like "photos/foo.jpg" relative to announcement/
      const rel = data.hero.src.replace(/^announcement\//, "");
      img.src = "../announcement/" + rel;
      img.alt = "Current hero";
      heroPreview.appendChild(img);
    }

    photoList.replaceChildren();
    const photos = data.photos || [];
    if (!photos.length) {
      const li = document.createElement("li");
      li.textContent = "None yet";
      photoList.appendChild(li);
      return;
    }
    photos.forEach((photo) => {
      const src = typeof photo === "string" ? photo : photo.src;
      const orient = typeof photo === "string" ? "?" : photo.orient || "?";
      const li = document.createElement("li");
      li.textContent = src + " (" + orient + ")";
      photoList.appendChild(li);
    });
  }

  function apiHeaders(token) {
    return {
      Accept: "application/vnd.github+json",
      Authorization: "Bearer " + token,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    };
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
      encodeURIComponent(BRANCH);
    const res = await fetch(url, { headers: apiHeaders(token) });
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
    const res = await fetch(url, {
      method: "PUT",
      headers: apiHeaders(token),
      body: JSON.stringify(payload),
    });
    // 409 = file changed since we read its sha (common if two saves overlap
    // or photos take a while). Re-read and retry with the latest sha.
    if (res.status === 409 && tryNumber < 3) {
      const fresh = await githubGet(path, token);
      return githubPut(
        path,
        contentBase64,
        message,
        token,
        fresh && fresh.sha,
        tryNumber + 1
      );
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
        reject(new Error("Could not read image"));
      };
      img.src = url;
    });
  }

  async function compressImage(file) {
    const img = await loadImage(file);
    const orient = orientOf(img.naturalWidth, img.naturalHeight);
    let width = img.naturalWidth;
    let height = img.naturalHeight;
    const maxEdge = Math.max(width, height);
    if (maxEdge > MAX_EDGE) {
      const scale = MAX_EDGE / maxEdge;
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, width, height);

    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY)
    );
    if (!blob) throw new Error("Image compression failed");
    const buffer = new Uint8Array(await blob.arrayBuffer());
    return {
      base64: bytesToBase64(buffer),
      orient: orient,
      ext: "jpg",
    };
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
      data = JSON.parse(decodeGithubContent(file));
    }
    fillForm();
  }

  clearTokenBtn.addEventListener("click", () => {
    localStorage.removeItem(TOKEN_KEY);
    tokenInput.value = "";
    refreshTokenUi();
    setStatus("Token cleared from this phone.", "ok");
  });

  clearPhotosBtn.addEventListener("click", () => {
    data.photos = [];
    fillForm();
    setStatus("Gallery cleared in the form. Save to publish.", "ok");
  });

  field("weightKg").addEventListener("input", refreshWeightAdvice);
  document.getElementById("weight-advice-use").addEventListener("click", () => {
    const suggestion =
      document.getElementById("weight-advice-use").dataset.suggestion || "";
    if (!suggestion) return;
    field("weightLbOz").value = suggestion;
    refreshWeightAdvice();
  });

  function isRootLive(html) {
    const text = html || "";
    if (!text.trim()) return false;
    // Live root serves the announcement page (with base href), not a redirect
    return (
      /base\s+href=["']\/announcement\/["']/i.test(text) ||
      (/hero-stage/i.test(text) && !/http-equiv=["']refresh/i.test(text))
    );
  }

  async function refreshLiveStatus() {
    if (!liveStatus) return;
    try {
      const res = await fetch("../index.html", { cache: "no-store" });
      if (!res.ok) {
        liveStatus.textContent = "Could not read root page.";
        liveStatus.classList.remove("ok");
        return;
      }
      const html = await res.text();
      if (isRootLive(html)) {
        liveStatus.textContent = "Root is live (announcement at baby.davyson.com).";
        liveStatus.classList.add("ok");
      } else {
        liveStatus.textContent = "Root is blank (not live yet).";
        liveStatus.classList.remove("ok");
      }
    } catch (_) {
      liveStatus.textContent = "Could not read root page.";
      liveStatus.classList.remove("ok");
    }
  }

  function buildLiveRootHtml(announcementHtml) {
    let html = String(announcementHtml || "");
    html = html.replace(/\s*<base\b[^>]*>/gi, "");
    html = html.replace(/\s*<link\s+rel=["']canonical["'][^>]*>/gi, "");
    if (!/<head[\s>]/i.test(html)) {
      throw new Error("announcement/index.html is missing a <head>");
    }
    return html.replace(
      /<head([^>]*)>/i,
      '<head$1>\n    <base href="/announcement/" />\n    <link rel="canonical" href="/" />'
    );
  }

  async function ensureToken() {
    const typedToken = String(tokenInput.value || "").trim();
    if (typedToken) {
      localStorage.setItem(TOKEN_KEY, typedToken);
      refreshTokenUi();
    }
    const token = getToken();
    if (!token) {
      setStatus("Paste a GitHub token first.", "error");
      return null;
    }
    return token;
  }

  async function writeRootIndex(html, message) {
    const token = await ensureToken();
    if (!token) return;
    goLiveBtn.disabled = true;
    unpublishBtn.disabled = true;
    setStatus(message.startsWith("Unpublish") ? "Unpublishing…" : "Going live…");
    try {
      const existing = await githubGet(ROOT_INDEX_PATH, token);
      await githubPut(
        ROOT_INDEX_PATH,
        textToBase64(html),
        message,
        token,
        existing && existing.sha
      );
      await refreshLiveStatus();
      setStatus(
        message.startsWith("Unpublish")
          ? "Root blank again — site updates in about a minute."
          : "Live at baby.davyson.com — updates in about a minute.",
        "ok"
      );
    } catch (err) {
      console.error(err);
      setStatus(err.message || String(err), "error");
    } finally {
      goLiveBtn.disabled = false;
      unpublishBtn.disabled = false;
    }
  }

  goLiveBtn.addEventListener("click", async () => {
    const token = await ensureToken();
    if (!token) return;
    goLiveBtn.disabled = true;
    unpublishBtn.disabled = true;
    setStatus("Going live…");
    try {
      const page = await githubGet(ANN_INDEX_PATH, token);
      if (!page) throw new Error("announcement/index.html not found on GitHub");
      const html = buildLiveRootHtml(decodeGithubContent(page));
      const existing = await githubGet(ROOT_INDEX_PATH, token);
      await githubPut(
        ROOT_INDEX_PATH,
        textToBase64(html),
        "Go live: serve announcement at site root",
        token,
        existing && existing.sha
      );
      await refreshLiveStatus();
      setStatus(
        "Live at baby.davyson.com — content is on the root URL. Updates in about a minute.",
        "ok"
      );
    } catch (err) {
      console.error(err);
      setStatus(err.message || String(err), "error");
    } finally {
      goLiveBtn.disabled = false;
      unpublishBtn.disabled = false;
    }
  });

  unpublishBtn.addEventListener("click", () => {
    writeRootIndex(BLANK_ROOT_HTML, "Unpublish: blank out root index.html");
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    setStatus("");

    const typedToken = String(tokenInput.value || "").trim();
    if (typedToken) {
      localStorage.setItem(TOKEN_KEY, typedToken);
      refreshTokenUi();
    }

    const token = getToken();
    if (!token) {
      setStatus("Paste a GitHub token first.", "error");
      return;
    }

    saveBtn.disabled = true;
    setStatus("Saving…");

    try {
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

      const heroFile = field("heroFile").files[0];
      if (heroFile) {
        setStatus("Compressing hero photo…");
        const compressed = await compressImage(heroFile);
        const fileName = stampName("hero-", compressed.ext);
        const path = PHOTOS_PREFIX + fileName;
        const existing = await githubGet(path, token);
        await githubPut(
          path,
          compressed.base64,
          "Update announcement hero photo",
          token,
          existing && existing.sha
        );
        data.hero = {
          src: "photos/" + fileName,
          orient: compressed.orient,
        };
      }

      const galleryFiles = Array.from(field("photoFiles").files || []);
      for (let i = 0; i < galleryFiles.length; i++) {
        setStatus(
          "Compressing gallery photo " + (i + 1) + " of " + galleryFiles.length + "…"
        );
        const compressed = await compressImage(galleryFiles[i]);
        const fileName = stampName("photo-", compressed.ext);
        const path = PHOTOS_PREFIX + fileName;
        const existing = await githubGet(path, token);
        await githubPut(
          path,
          compressed.base64,
          "Add announcement gallery photo",
          token,
          existing && existing.sha
        );
        data.photos.push({
          src: "photos/" + fileName,
          orient: compressed.orient,
        });
      }

      setStatus("Updating data.json…");
      data.updatedAt = Date.now();
      const existingData = await githubGet(DATA_PATH, token);
      const json = JSON.stringify(data, null, 2) + "\n";
      await githubPut(
        DATA_PATH,
        textToBase64(json),
        "Update announcement details",
        token,
        existingData && existingData.sha
      );

      field("heroFile").value = "";
      field("photoFiles").value = "";
      fillForm();
      setStatus(
        "Saved — announcement should refresh within a few seconds.",
        "ok"
      );
    } catch (err) {
      console.error(err);
      setStatus(err.message || String(err), "error");
    } finally {
      saveBtn.disabled = false;
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
