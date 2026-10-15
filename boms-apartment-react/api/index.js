import app from "../server.js";

export function restoreVercelApiPath(request) {
	const incomingUrl = new URL(request.url || "/", "https://vercel.invalid");
	const originalPath = incomingUrl.searchParams.get("__vercel_path");
	if (!originalPath?.startsWith("/api/") || originalPath === "/api/index") return;

	incomingUrl.searchParams.delete("__vercel_path");
	const query = incomingUrl.searchParams.toString();
	request.url = `${originalPath}${query ? `?${query}` : ""}`;
}

export default function handler(request, response) {
	restoreVercelApiPath(request);
	app(request, response);
}
