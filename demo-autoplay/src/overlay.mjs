// Injected into every page (re-runs on each full navigation). It draws a cursor dot, a click ripple
// and a caption bar on top of the REAL app. Position and caption persist in sessionStorage so they
// survive navigations. It never touches the app's own DOM beyond appending one fixed overlay element.
export function overlayInit() {
  if (window.__demoInstalled) return;
  window.__demoInstalled = true;
  const KEY = "__demo_state";
  const load = () => { try { return JSON.parse(sessionStorage.getItem(KEY)) || {}; } catch { return {}; } };
  const save = () => { try { sessionStorage.setItem(KEY, JSON.stringify(st)); } catch {} };
  const st = Object.assign({ x: 215, y: 520, caption: "" }, load());
  let root, dot, cap, ripple;

  function build() {
    root = document.createElement("div");
    root.id = "__demo_overlay";
    root.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2147483647;";
    dot = document.createElement("div");
    dot.style.cssText =
      "position:absolute;left:0;top:0;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;" +
      "background:rgba(215,25,32,.88);border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.45);" +
      "transform:translate(" + st.x + "px," + st.y + "px);";
    ripple = document.createElement("div");
    ripple.style.cssText =
      "position:absolute;left:0;top:0;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;" +
      "border:3px solid rgba(215,25,32,.9);opacity:0;";
    cap = document.createElement("div");
    cap.style.cssText =
      "position:absolute;left:10px;right:10px;bottom:12px;padding:12px 14px;border-radius:12px;" +
      "background:rgba(20,20,30,.92);color:#fff;font:600 15px/1.35 system-ui,-apple-system,Segoe UI,sans-serif;" +
      "text-align:center;box-shadow:0 4px 18px rgba(0,0,0,.4);transition:opacity .25s;" +
      "opacity:" + (st.caption ? 1 : 0) + ";";
    cap.textContent = st.caption;
    root.append(ripple, dot, cap);
  }

  function ensure() {
    if (!document.documentElement) return;
    if (!root) build();
    if (!root.isConnected) document.documentElement.appendChild(root);
  }
  // Re-attach if React hydration or a re-render drops it. Attach late enough to avoid hydration mismatches.
  setInterval(ensure, 150);
  document.addEventListener("DOMContentLoaded", () => setTimeout(ensure, 60));

  window.__demo = {
    ready: () => !!(root && root.isConnected),
    move(x, y, ms) {
      ensure();
      st.x = x; st.y = y; save();
      dot.style.transition = "transform " + ms + "ms cubic-bezier(.4,0,.2,1)";
      dot.style.transform = "translate(" + x + "px," + y + "px)";
    },
    click() {
      ensure();
      ripple.style.transition = "none";
      ripple.style.transform = "translate(" + st.x + "px," + st.y + "px) scale(1)";
      ripple.style.opacity = "1";
      void ripple.offsetWidth;
      ripple.style.transition = "transform .5s ease-out, opacity .5s ease-out";
      ripple.style.transform = "translate(" + st.x + "px," + st.y + "px) scale(3.2)";
      ripple.style.opacity = "0";
    },
    caption(text) {
      ensure();
      st.caption = text || ""; save();
      cap.textContent = st.caption;
      cap.style.opacity = st.caption ? "1" : "0";
    },
  };
}
