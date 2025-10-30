import { create } from 'zustand';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

type S = { checked: boolean; session: Session | null; user: User | null };
type A = { initialize: () => Promise<void> };

export const useAuthStore = create<S & A>((set) => ({
  checked: false,
  session: null,
  user: null,
  initialize: async () => {
    const { data } = await supabase.auth.getSession();
    set({ checked: true, session: data.session ?? null, user: data.session?.user ?? null });
    supabase.auth.onAuthStateChange((_e, sess) => {
      set({ checked: true, session: sess ?? null, user: sess?.user ?? null });
    });
  },
}));
