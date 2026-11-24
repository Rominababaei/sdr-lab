const links = Array.from(document.querySelectorAll("#section-links a"));
const sections = links.map(link => document.getElementById(link.hash.slice(1)));

function setActiveSection() {
  const threshold = 118;
  let active = 0;
  for (let index = 1; index < sections.length; index += 1) {
    if (sections[index].getBoundingClientRect().top > threshold) break;
    active = index;
  }
  links.forEach((link, index) => {
    if (index === active) link.setAttribute("aria-current", "location");
    else link.removeAttribute("aria-current");
  });
}

let pending = false;
function scheduleUpdate() {
  if (pending) return;
  pending = true;
  requestAnimationFrame(() => {
    pending = false;
    setActiveSection();
  });
}

if (sections.length && sections.every(Boolean)) {
  setActiveSection();
  addEventListener("scroll", scheduleUpdate, { passive: true });
  addEventListener("resize", scheduleUpdate);
  addEventListener("hashchange", scheduleUpdate);
}

