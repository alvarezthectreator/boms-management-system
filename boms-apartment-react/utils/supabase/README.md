# Supabase integration

This project uses the supplied Supabase packages with the existing Vite + Express architecture.

- Browser clients use `utils/supabase/client.js`.
- Server clients use `utils/supabase/server.js`.
- Express middleware uses `utils/supabase/middleware.js`.
- The existing BOMS HTTP-only authentication is unchanged.

Configure the values in `.env.local`. The browser client must use the Vite-prefixed variables, while the server client uses the Next-compatible variables.

Example browser usage:

```js
import { createSupabaseBrowserClient } from "./utils/supabase/client.js";

const supabase = createSupabaseBrowserClient();
const { data } = await supabase.from("todos").select();
```
