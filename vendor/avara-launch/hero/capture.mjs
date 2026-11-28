// Pass to page.evaluate with selectors for the already-identified visible hero.
export function captureHero(selectors) {
  const hero = document.querySelector(selectors.hero);
  if (!hero) return { skip: "Hero missing" };
  const bounds = hero.getBoundingClientRect();
  const viewport = [window.innerWidth, window.innerHeight];
  function visible(el) {
    if (!el || !el.checkVisibility({checkOpacity: true, checkVisibilityCSS: true})) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.right > 0 && r.left < viewport[0]
      && r.bottom > 0 && r.top < viewport[1];
  }
  if (!visible(hero)) return { skip: "Hero outside first viewport or hidden" };
  const features = {};
  for (const name of ["heading", "action", "visual"]) {
    const element = [...hero.querySelectorAll(selectors[name])].find(visible);
    if (!element) continue;
    const r = element.getBoundingClientRect();
    features[name + "X"] = (r.left + r.width / 2 - bounds.left) / bounds.width;
    features[name + "Y"] = (r.top + r.height / 2 - bounds.top) / bounds.height;
    if (name === "visual") {
      features.visualWidth = r.width / bounds.width;
      features.visualHeight = r.height / bounds.height;
    }
  }
  return { viewport, features };
}
