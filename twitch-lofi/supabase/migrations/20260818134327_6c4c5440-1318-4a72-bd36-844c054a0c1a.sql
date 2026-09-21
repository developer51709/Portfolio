ALTER TABLE public.tracks
  ADD COLUMN IF NOT EXISTS credit text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS tracks_sort_order_idx ON public.tracks (sort_order, created_at);