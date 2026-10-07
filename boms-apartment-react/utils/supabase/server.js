import { createServerClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

function parseCookies(cookieHeader = "") {
  return cookieHeader.split(";").map((cookie) => cookie.trim()).filter(Boolean).map((cookie) => {
    const separator = cookie.indexOf("=");
    if (separator === -1) return null;
    const name = cookie.slice(0, separator);
    const value = decodeURIComponent(cookie.slice(separator + 1));
    return { name, value };
  }).filter(Boolean);
}

function serializeCookie(name, value, options = {}) {
  const attributes = [
    `Path=${options.path || "/"}`,
    options.maxAge !== undefined ? `Max-Age=${options.maxAge}` : null,
    `HttpOnly`,
    options.sameSite ? `SameSite=${String(options.sameSite)}` : null,
    options.secure ? "Secure" : null,
    options.domain ? `Domain=${options.domain}` : null,
  ].filter(Boolean).join("; ");
  return `${name}=${encodeURIComponent(value)}; ${attributes}`;
}

function createClient(request, response) {
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase environment variables are not configured.");
  }

  const cookies = parseCookies(request.headers.cookie);
  const setCookie = (name, value, options = {}) => {
    const current = response.getHeader("Set-Cookie") || [];
    const headerValues = Array.isArray(current) ? current : [current];
    response.setHeader("Set-Cookie", [...headerValues, serializeCookie(name, value, options)]);
  };

  return createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return cookies;
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => setCookie(name, value, options));
      },
    },
  });
}

export function createSupabaseServerClient(request, response) {
  return createClient(request, response);
}

export async function refreshSupabaseSession(request, response) {
  if (!request.headers.cookie?.includes("sb_")) return null;
  const supabase = createSupabaseServerClient(request, response);
  const { data, error } = await supabase.auth.getUser();
  if (error) return { user: null, error };
  return { user: data.user, error: null };
}
