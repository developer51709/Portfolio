CREATE TABLE public.settings (
  id INT PRIMARY KEY DEFAULT 1,
  secret_phrase TEXT NOT NULL DEFAULT 'change-me-now',
  oxapay_merchant_key TEXT NOT NULL DEFAULT '',
  overlay_text TEXT NOT NULL DEFAULT 'Lofi radio 24/7',
  overlay_settings JSONB NOT NULL DEFAULT '{"show_qr": true, "show_ads": true, "refresh_seconds": 10, "theme": "dark"}'::jsonb,
  stream_settings JSONB NOT NULL DEFAULT '{"rtmp_url": "rtmp://live.twitch.tv/app", "stream_key": "", "resolution": "1920x1080", "fps": 30, "video_bitrate": "4500k", "audio_bitrate": "160k", "preset": "veryfast"}'::jsonb,
  track_metadata JSONB NOT NULL DEFAULT '{"title": "Untitled", "artist": "", "album": "", "playlist_url": ""}'::jsonb,
  crypto_wallets JSONB NOT NULL DEFAULT '[]'::jsonb,
  donation_settings JSONB NOT NULL DEFAULT '{"description": "Support the stream", "min_amount": 1, "currency": "USDT", "reward_text": "Your name on the overlay!"}'::jsonb,
  ad_settings JSONB NOT NULL DEFAULT '{"rotation_seconds": 20, "max_active": 5, "schedule": []}'::jsonb,
  background_video_url TEXT NOT NULL DEFAULT '',
  lofi_settings JSONB NOT NULL DEFAULT '{"generator_url": "", "credit_text": "", "seed": ""}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT settings_singleton CHECK (id = 1)
);
GRANT ALL ON public.settings TO service_role;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

INSERT INTO public.settings (id) VALUES (1);

CREATE TABLE public.sessions (
  token TEXT PRIMARY KEY,
  label TEXT NOT NULL DEFAULT 'stream-host',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ
);
GRANT ALL ON public.sessions TO service_role;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.ads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  advertiser_name TEXT NOT NULL,
  advertiser_email TEXT NOT NULL DEFAULT '',
  banner_url TEXT NOT NULL,
  click_url TEXT NOT NULL DEFAULT '',
  duration_seconds INT NOT NULL DEFAULT 15,
  start_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  end_time TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending',
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.ads TO service_role;
ALTER TABLE public.ads ENABLE ROW LEVEL SECURITY;
CREATE INDEX ads_status_idx ON public.ads (status, start_time DESC);

CREATE TABLE public.donations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  amount NUMERIC(18,6) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USDT',
  donor_name TEXT NOT NULL DEFAULT 'Anonymous',
  message TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  track_id TEXT NOT NULL DEFAULT '',
  pay_link TEXT NOT NULL DEFAULT '',
  provider_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.donations TO service_role;
ALTER TABLE public.donations ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  level TEXT NOT NULL DEFAULT 'info',
  source TEXT NOT NULL DEFAULT 'stream-host',
  message TEXT NOT NULL,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.logs TO service_role;
ALTER TABLE public.logs ENABLE ROW LEVEL SECURITY;
CREATE INDEX logs_created_at_idx ON public.logs (created_at DESC);

CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER settings_touch BEFORE UPDATE ON public.settings FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER ads_touch BEFORE UPDATE ON public.ads FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER donations_touch BEFORE UPDATE ON public.donations FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();