import { defineConfig } from "vite";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	publicDir: "public",
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
