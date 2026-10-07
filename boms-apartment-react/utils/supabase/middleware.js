import { refreshSupabaseSession } from "./server.js";

export async function supabaseSessionMiddleware(request, response, next) {
  try {
    const session = await refreshSupabaseSession(request, response);
    request.supabaseSession = session;
  } catch (error) {
    request.supabaseSession = { user: null, error };
  }

  next();
}
