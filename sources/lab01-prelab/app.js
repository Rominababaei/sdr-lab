"use strict";
const sourceNode = document.getElementById("source-code");
const feedback = document.getElementById("code-feedback");
let source = "";
fetch("downloads/sdrlab_iq_recorder.py").then(response => {
  if (!response.ok) throw new Error("Code could not be loaded");
  return response.text();
}).then(text => {
  source = text;
  sourceNode.textContent = text;
}).catch(() => {
  sourceNode.textContent = "نمایش کد ممکن نشد؛ از لینک دانلود فایل استفاده کنید.";
  document.getElementById("copy-code").disabled = true;
});
document.getElementById("copy-code").addEventListener("click", async () => {
  if (!source) { feedback.textContent = "لطفاً تا بارگذاری کد صبر کنید."; return; }
  try {
    await navigator.clipboard.writeText(source);
    feedback.textContent = "کد در کلیپ‌بورد کپی شد.";
    const button = document.getElementById("copy-code");
    button.textContent = "کپی شد ✓";
    setTimeout(() => { button.textContent = "کپی کد"; }, 2200);
  } catch {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(sourceNode);
    selection.removeAllRanges();
    selection.addRange(range);
    let copied = false;
    try { copied = document.execCommand("copy"); } catch { /* Manual copy remains available. */ }
    feedback.textContent = copied ? "کد در کلیپ‌بورد کپی شد." : "کد انتخاب شد؛ برای کپی Ctrl+C را بزنید یا فایل را دانلود کنید.";
  }
});
fetch("content.json").then(response => {
  if (!response.ok) throw new Error("Content unavailable");
  return response.json();
}).then(content => {
  let ready = 1;
  if (content.flowgraph) {
    document.getElementById("grc-status").textContent = "آماده";
    document.getElementById("grc-status").className = "status ready";
    const link = document.getElementById("grc-link");
    link.href = content.flowgraph; link.hidden = false;
    document.getElementById("grc-empty").hidden = true; ready++;
  }
  if (content.screenshot) {
    document.getElementById("image-status").textContent = "آماده";
    document.getElementById("image-status").className = "status ready";
    const link = document.getElementById("image-link");
    link.href = content.screenshot; link.hidden = false;
    document.getElementById("image-empty").hidden = true;
    document.getElementById("actual-image").src = content.screenshot;
    document.getElementById("actual-image-link").href = content.screenshot;
    document.getElementById("actual-flowgraph").hidden = false; ready++;
  }
  document.getElementById("progress-label").textContent = ready.toLocaleString("fa-IR") + " از ۳ فایل آماده";
  if (ready === 3) {
    document.getElementById("draft-title").textContent = "فایل‌های پیش‌گزارش آمادهٔ دریافت‌اند";
    document.getElementById("draft-text").textContent = "تصویر فلوگراف، فایل قابل ویرایش و کد ضبط در این صفحه قرار گرفته‌اند.";
  } else if (ready === 2) {
    document.getElementById("draft-text").textContent = content.flowgraph ? "کد ضبط و فلوگراف آماده‌اند؛ تصویر محیط GNU Radio هنوز افزوده نشده است." : "کد ضبط و تصویر آماده‌اند؛ فایل قابل ویرایش فلوگراف هنوز افزوده نشده است.";
  }
}).catch(() => { /* The initial HTML accurately lists the available code. */ });
