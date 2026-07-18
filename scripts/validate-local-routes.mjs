import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import viteConfig from "../vite.config.js";

const routingPlugin = viteConfig.plugins.find((plugin) => plugin.name === "safemind-local-page-routing");
assert(routingPlugin, "The local page-routing plugin is missing.");

let developmentRouter;
let previewRouter;
routingPlugin.configureServer({ middlewares: { use(handler) { developmentRouter = handler; } } });
routingPlugin.configurePreviewServer({ middlewares: { use(handler) { previewRouter = handler; } } });
assert.equal(developmentRouter, previewRouter, "Development and preview must use the same route table.");

const routes = new Map([
  ["/login", "/src/pages/login.html"],
  ["/signup/", "/src/pages/signup.html"],
  ["/dashboard?view=investigation", "/src/pages/dashboard.html?view=investigation"],
  ["/reports", "/src/pages/reports.html"],
  ["/eduai", "/src/pages/education.html"],
  ["/eduai/article?id=example", "/src/pages/education-article.html?id=example"],
  ["/settings", "/src/pages/profile.html"],
  ["/welcome", "/src/pages/onboarding.html"],
  ["/intro", "/src/pages/splash.html"],
  ["/sitemap", "/src/pages/sitemap.html"]
]);

function run(url) {
  const request = { url };
  const response = {
    statusCode: 200,
    headers: {},
    ended: false,
    setHeader(name, value) { this.headers[name] = value; },
    end() { this.ended = true; }
  };
  let continued = false;
  developmentRouter(request, response, () => { continued = true; });
  return { request, response, continued };
}

for (const [route, expected] of routes) {
  const result = run(route);
  assert(result.continued, `${route} did not continue to Vite.`);
  assert.equal(result.request.url, expected, `${route} mapped to the wrong page.`);
  const pagePath = expected.split("?")[0].replace(/^\//, "");
  assert(existsSync(resolve(pagePath)), `${pagePath} does not exist.`);
}

for (const route of ["/scam-checker", "/src/pages/scam-checker.html"]) {
  const result = run(route);
  assert.equal(result.response.statusCode, 302);
  assert.equal(result.response.headers.Location, "/dashboard?view=investigation");
  assert(result.response.ended);
  assert(!result.continued);
}

const legacy = run("/src/pages/dashboard.html?view=activity");
assert.equal(legacy.response.statusCode, 302);
assert.equal(legacy.response.headers.Location, "/dashboard?view=activity");

console.log(`Local routing passed for ${routes.size} clean page URLs and 3 legacy redirects.`);
