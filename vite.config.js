import { defineConfig } from "vite";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));

const pageRoutes = new Map([
	["/login", "/src/pages/login.html"],
	["/signup", "/src/pages/signup.html"],
	["/dashboard", "/src/pages/dashboard.html"],
	["/reports", "/src/pages/reports.html"],
	["/eduai", "/src/pages/education.html"],
	["/eduai/article", "/src/pages/education-article.html"],
	["/settings", "/src/pages/profile.html"],
	["/welcome", "/src/pages/onboarding.html"],
	["/intro", "/src/pages/splash.html"],
	["/sitemap", "/src/pages/sitemap.html"]
]);

const legacyPageRoutes = new Map([
	["/src/pages/main.html", "/"],
	["/src/pages/index.html", "/"],
	...Array.from(pageRoutes, ([route, page]) => [page, route])
]);

function localPageRouter(request, response, next) {
	const url = new URL(request.url || "/", "http://localhost");
	const pathname = url.pathname.length > 1 ? url.pathname.replace(/\/$/, "") : url.pathname;
	if (pathname === "/scam-checker" || pathname === "/src/pages/scam-checker.html") {
		response.statusCode = 302;
		response.setHeader("Location", "/dashboard?view=investigation");
		response.end();
		return;
	}
	const legacyDestination = legacyPageRoutes.get(pathname);
	if (legacyDestination) {
		response.statusCode = 302;
		response.setHeader("Location", `${legacyDestination}${url.search}`);
		response.end();
		return;
	}
	const page = pageRoutes.get(pathname);
	if (page) request.url = `${page}${url.search}`;
	next();
}

const localPageRoutingPlugin = {
	name: "safemind-local-page-routing",
	configureServer(server) {
		server.middlewares.use(localPageRouter);
	},
	configurePreviewServer(server) {
		server.middlewares.use(localPageRouter);
	}
};

export default defineConfig({
	publicDir: "public",
	plugins: [localPageRoutingPlugin, {
		name: "safemind-root-landing-page",
		enforce: "pre",
		transformIndexHtml: {
			order: "pre",
			handler(html, context) {
				if (resolve(context.filename) !== resolve(__dirname, "index.html")) return html;
				return readFileSync(resolve(__dirname, "src/pages/main.html"), "utf8");
			}
		}
	}],
	server: {
		strictPort: true,
		proxy: {
			"/api/spam-check": "http://127.0.0.1:5050",
			"/api/education-chat": "http://127.0.0.1:5051",
			"/health": "http://127.0.0.1:5050"
		}
	},
	build: {
		outDir: "dist",
		rollupOptions: {
			input: {
				index: resolve(__dirname, "index.html"),
				splash: resolve(__dirname, "src/pages/splash.html"),
				main: resolve(__dirname, "src/pages/main.html"),
				login: resolve(__dirname, "src/pages/login.html"),
				signup: resolve(__dirname, "src/pages/signup.html"),
				dashboard: resolve(__dirname, "src/pages/dashboard.html"),
				reports: resolve(__dirname, "src/pages/reports.html"),
				education: resolve(__dirname, "src/pages/education.html"),
				educationArticle: resolve(__dirname, "src/pages/education-article.html"),
				sitemap: resolve(__dirname, "src/pages/sitemap.html"),
				profile: resolve(__dirname, "src/pages/profile.html"),
				onboarding: resolve(__dirname, "src/pages/onboarding.html")
			}
		}
	}
});
