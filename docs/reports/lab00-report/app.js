(() => {
  "use strict";
  const navigation = Array.from(document.querySelectorAll("#report-navigation a"));
  const chapters = Array.from(document.querySelectorAll(".chapter"));
  const updateReading = () => {
    const total = document.documentElement.scrollHeight - window.innerHeight;
    const percent = total > 0 ? Math.min(100, Math.max(0, window.scrollY / total * 100)) : 0;
    document.documentElement.style.setProperty("--reading-progress", percent + "%");
    let current = chapters[0];
    const offset = window.innerWidth <= 800 ? 165 : 140;
    for (const chapter of chapters) {
      if (chapter.getBoundingClientRect().top <= offset) current = chapter;
    }
    navigation.forEach(link => {
      const active = link.hash === "#" + current.id;
      link.classList.toggle("active", active);
      if (active) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    });
  };
  let scheduled = false;
  window.addEventListener("scroll", () => {
    if (!scheduled) {
      scheduled = true;
      requestAnimationFrame(() => { updateReading(); scheduled = false; });
    }
  }, { passive: true });
  window.addEventListener("resize", updateReading);
  updateReading();
  document.querySelector("#print-report").addEventListener("click", () => window.print());

  document.querySelectorAll(".copy-code").forEach(button => {
    button.addEventListener("click", async () => {
      const text = button.closest(".code-block").querySelector("code").textContent;
      try {
        await navigator.clipboard.writeText(text);
        button.textContent = "کپی شد";
        document.querySelector("#copy-announcement").textContent = "کد در کلیپ‌بورد کپی شد.";
      } catch {
        button.textContent = "انتخاب کد";
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(button.closest(".code-block").querySelector("code"));
        selection.removeAllRanges();
        selection.addRange(range);
        document.querySelector("#copy-announcement").textContent = "کد انتخاب شد. برای کپی از صفحه‌کلید استفاده کنید.";
      }
      window.setTimeout(() => { button.textContent = "کپی کد"; }, 2200);
    });
  });

  const viewer = document.querySelector("#evidence-viewer");
  const viewerImage = document.querySelector("#viewer-image");
  const zoomButton = document.querySelector("#zoom-viewer");
  let imageTrigger = null;
  document.querySelectorAll(".image-open").forEach(button => {
    button.addEventListener("click", () => {
      imageTrigger = button;
      document.querySelector("#viewer-title").textContent = button.dataset.title;
      document.querySelector("#viewer-caption").textContent = button.dataset.caption;
      viewerImage.src = button.dataset.image;
      viewerImage.alt = button.querySelector("img").alt;
      document.querySelector("#open-original").href = button.dataset.image;
      viewer.classList.remove("is-zoomed");
      zoomButton.textContent = "بزرگ‌نمایی تا اندازهٔ اصلی";
      zoomButton.setAttribute("aria-pressed", "false");
      document.body.classList.add("viewer-open");
      viewer.showModal();
      document.querySelector("#close-viewer").focus();
    });
  });
  document.querySelector("#close-viewer").addEventListener("click", () => viewer.close());
  viewer.addEventListener("click", event => { if (event.target === viewer) viewer.close(); });
  viewer.addEventListener("close", () => {
    document.body.classList.remove("viewer-open");
    viewer.classList.remove("is-zoomed");
    if (imageTrigger) imageTrigger.focus({ preventScroll: true });
  });
  zoomButton.addEventListener("click", () => {
    const zoomed = viewer.classList.toggle("is-zoomed");
    zoomButton.setAttribute("aria-pressed", String(zoomed));
    zoomButton.textContent = zoomed ? "اندازهٔ متناسب با صفحه" : "بزرگ‌نمایی تا اندازهٔ اصلی";
  });
})();
