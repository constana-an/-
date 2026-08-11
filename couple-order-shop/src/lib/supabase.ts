import type { SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** True when the build carries a Supabase project, i.e. cloud sync is possible. */
export const cloudEnabled = Boolean(supabaseUrl && supabaseKey);

let clientPromise: Promise<SupabaseClient> | null = null;

/**
 * Loads `@supabase/supabase-js` on demand. Local-mode installs never configure a
 * project, so they should not pay ~200 kB for a client they will never call.
 */
export function getSupabase(): Promise<SupabaseClient> | null {
  if (!cloudEnabled) return null;
  if (!clientPromise) {
    clientPromise = import("@supabase/supabase-js").then(({ createClient }) =>
      createClient(supabaseUrl!, supabaseKey!),
    );
  }
  return clientPromise;
}

export type { SupabaseClient };
