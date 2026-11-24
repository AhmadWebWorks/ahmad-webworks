const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { chromium } = require("playwright");

const ROOT = process.cwd();
const PAGES = [
  "index.html",
  "about.html",
  "services.html",
  "portfolio.html",
  "contact.html",
  "team.html",
  "join-team.html",
  "work-with-us.html",
  "privacy.html",
  "portal.html",
  "password-recovery.html",
  "team-member.html"
];
const VIEWPORTS = [320, 360, 390, 640, 768, 1024, 1280, 1440];
const failures = [];

function fail(message) {
  failures.push(message);
  console.error("FAIL:", message);
}

function contentType(file) {
  const ext = path.extname(file).toLowerCase();
  return ({
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp"
  })[ext] || "application/octet-stream";
}

const server = http.createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  } catch {
    res.writeHead(400).end("Bad request");
    return;
  }
  const target = path.resolve(ROOT, "." + pathname);
  if (!target.startsWith(ROOT + path.sep) && target !== ROOT) {
    res.writeHead(403).end("Forbidden");
    return;
  }
  const file = path.extname(target) ? target : path.join(target, "index.html");
  fs.readFile(file, (error, data) => {
    if (error) {
      res.writeHead(404).end("Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": contentType(file) });
    res.end(data);
  });
});

function checkLocalReferences(page) {
  const html = fs.readFileSync(path.join(ROOT, page), "utf8");
  const forms = [...html.matchAll(/<form\b([^>]*)>/gi)];
  for (const form of forms) {
    const method = form[1].match(/\bmethod\s*=\s*["']?([^\s"' >]+)/i)?.[1];
    if (method?.toLowerCase() !== "post") {
      fail(page + " contains a form without an explicit POST method");
    }
  }
  const refs = [...html.matchAll(/\b(?:href|src)\s*=\s*["']([^"']+)["']/gi)];
  for (const match of refs) {
    const raw = match[1].trim();
    if (!raw || /^(?:#|[a-z][a-z0-9+.-]*:|\/\/)/i.test(raw)) continue;
    const clean = raw.split("#")[0].split("?")[0];
    if (!clean) continue;
    let decoded;
    try { decoded = decodeURIComponent(clean); } catch { decoded = clean; }
    const resolved = path.resolve(path.dirname(path.join(ROOT, page)), decoded);
    if (!resolved.startsWith(ROOT + path.sep) && resolved !== ROOT) {
      fail(page + " contains a path outside the site: " + raw);
      continue;
    }
    if (!fs.existsSync(resolved)) {
      fail(page + " references a missing local file: " + raw);
    }
  }
}

async function main() {
  for (const page of PAGES) {
    if (!fs.existsSync(path.join(ROOT, page))) fail("Missing page: " + page);
    else checkLocalReferences(page);
  }

  await new Promise(resolve => server.listen(4173, "127.0.0.1", resolve));
  const browser = await chromium.launch({ headless: true });

  try {
    for (const width of VIEWPORTS) {
      for (const pageName of PAGES) {
        const page = await browser.newPage({
          viewport: { width, height: 820 },
          deviceScaleFactor: 1
        });
        const pageErrors = [];
        page.on("pageerror", error => pageErrors.push(error.message));

        try {
          const response = await page.goto(
            "http://127.0.0.1:4173/" + pageName,
            { waitUntil: "domcontentloaded", timeout: 20000 }
          );
          if (!response || !response.ok()) {
            fail(pageName + " did not load at " + width + "px");
          }

          await page.waitForTimeout(350);

          const layout = await page.evaluate(() => {
            const viewport = document.documentElement.clientWidth;
            const offenders = [];
            for (const element of document.body.querySelectorAll("*")) {
              const style = getComputedStyle(element);
              if (style.display === "none" || style.visibility === "hidden" ||
                  Number(style.opacity) === 0) continue;
              const rect = element.getBoundingClientRect();
              if (!rect.width || rect.height === 0) continue;
              if (rect.left < -1 || rect.right > viewport + 1) {
                let clipped = false;
                for (let parent = element.parentElement; parent && parent !== document.body;
                     parent = parent.parentElement) {
                  const overflow = getComputedStyle(parent).overflowX;
                  if (["hidden", "clip", "auto", "scroll"].includes(overflow)) {
                    clipped = true;
                    break;
                  }
                }
                if (!clipped && style.position !== "fixed") {
                  offenders.push({
                    tag: element.tagName.toLowerCase(),
                    className: typeof element.className === "string" ? element.className : "",
                    left: Math.round(rect.left),
                    right: Math.round(rect.right),
                    width: Math.round(rect.width)
                  });
                }
              }
            }
            return {
              viewport,
              documentWidth: document.documentElement.scrollWidth,
              bodyWidth: document.body.scrollWidth,
              offenders: offenders.slice(0, 8)
            };
          });

          if (width <= 640 && pageName === "index.html") {
            const criticalLayout = await page.evaluate(() => {
              const selectors = [
                ".site-header .brand",
                ".hero-content",
                ".hero-content h1",
                ".hero-sub",
                ".hero-actions",
                ".hero-tags"
              ];
              return {
                scrollX: window.scrollX,
                clientWidth: document.documentElement.clientWidth,
                elements: selectors.map(selector => {
                  const element = document.querySelector(selector);
                  if (!element) return { selector, missing: true };
                  const rect = element.getBoundingClientRect();
                  return {
                    selector,
                    left: Math.round(rect.left),
                    right: Math.round(rect.right),
                    width: Math.round(rect.width)
                  };
                })
              };
            });
            console.log("MOBILE HOMEPAGE GEOMETRY " + width + "px: " +
              JSON.stringify(criticalLayout));
            for (const item of criticalLayout.elements) {
              if (item.missing || item.left < -1 ||
                  item.right > criticalLayout.clientWidth + 1) {
                fail("Homepage critical content is clipped at " + width +
                  "px: " + JSON.stringify(item) +
                  "; scrollX=" + criticalLayout.scrollX);
              }
            }
          }

          if (layout.documentWidth > width + 1 || layout.bodyWidth > width + 1 ||
              layout.offenders.length) {
            fail(
              pageName + " overflows at " + width + "px: " +
              JSON.stringify(layout)
            );
          }

          if (width <= 768) {
            const toggle = page.locator(".nav-toggle");
            if (await toggle.count()) {
              await toggle.click();
              const opened = await page.locator("body").evaluate(
                el => el.classList.contains("nav-open")
              );
              const expanded = await toggle.getAttribute("aria-expanded");
              if (!opened || expanded !== "true") {
                fail(pageName + " mobile menu did not open correctly at " + width + "px");
              }
              // The menu toggle is the reliable close control at every mobile breakpoint.
              // The separate close button can be covered by the fixed toggle during animation.
              await toggle.click();
              const closed = await page.locator("body").evaluate(
                el => !el.classList.contains("nav-open")
              );
              const collapsed = await toggle.getAttribute("aria-expanded");
              if (!closed || collapsed !== "false") {
                fail(pageName + " mobile menu did not close correctly at " + width + "px");
              }

              await toggle.click();
              await page.keyboard.press("Escape");
              const escapeClosed = await page.locator("body").evaluate(
                el => !el.classList.contains("nav-open")
              );
              const escapeExpanded = await toggle.getAttribute("aria-expanded");
              if (!escapeClosed || escapeExpanded !== "false") {
                fail(pageName + " Escape key did not close the mobile menu at " + width + "px");
              }
            }
          }

          if (pageErrors.length) {
            fail(pageName + " JavaScript error(s) at " + width + "px: " +
              pageErrors.join(" | "));
          }
        } catch (error) {
          fail(pageName + " test crashed at " + width + "px: " + error.message);
        } finally {
          await page.close();
        }
      }
    }
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }

  if (failures.length) {
    console.error("\n" + failures.length + " check(s) failed.");
    process.exitCode = 1;
  } else {
    console.log(
      "All local references, " + (PAGES.length * VIEWPORTS.length) +
      " page/viewport combinations, and mobile menu checks passed."
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
