const imageDialog = document.getElementById("image-dialog");
const enlargedImage = document.getElementById("dialog-image");
const originalImage = document.getElementById("original-image");
const imageCaption = document.getElementById("image-caption");
const closeImage = document.getElementById("close-image");

if (typeof imageDialog.showModal === "function") {
  document.addEventListener("click", (event) => {
    const link = event.target.closest("[data-zoom]");
    if (!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;

    const figure = link.closest("figure");
    const source = figure.querySelector("img");
    event.preventDefault();
    enlargedImage.src = link.href;
    enlargedImage.alt = source.alt;
    originalImage.href = link.href;
    imageCaption.textContent = figure.querySelector(".evidence-number").textContent + " · " + source.alt;
    imageDialog.showModal();
  });

  closeImage.addEventListener("click", () => imageDialog.close());
  imageDialog.addEventListener("click", (event) => {
    if (event.target !== imageDialog) return;
    const bounds = imageDialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right ||
        event.clientY < bounds.top || event.clientY > bounds.bottom) {
      imageDialog.close();
    }
  });
  imageDialog.addEventListener("close", () => enlargedImage.removeAttribute("src"));
}

const mobileContents = document.querySelector(".contents-mobile");
if (mobileContents) {
  mobileContents.addEventListener("click", (event) => {
    if (event.target.closest("a")) mobileContents.open = false;
  });
}

const chapters = Array.from(document.querySelectorAll(".chapter-title, #resources"));
if (chapters.length) {
  const contentsLinks = Array.from(document.querySelectorAll(".contents-panel nav a"));
  const siteHeader = document.querySelector(".site-header");
  let queued = false;
  let activeChapter = null;

  const highlightChapter = () => {
    const threshold = siteHeader.getBoundingClientRect().bottom + 46;
    const current = chapters.findLast((heading) => heading.getBoundingClientRect().top < threshold);
    if (current !== activeChapter) {
      activeChapter = current;
      for (const link of contentsLinks) {
        if (current && link.hash === "#" + current.id) {
          link.setAttribute("aria-current", "location");
        } else {
          link.removeAttribute("aria-current");
        }
      }
    }
    queued = false;
  };

  window.addEventListener("scroll", () => {
    if (queued) return;
    queued = true;
    window.requestAnimationFrame(highlightChapter);
  }, { passive: true });
  window.addEventListener("resize", highlightChapter, { passive: true });
  highlightChapter();
}
