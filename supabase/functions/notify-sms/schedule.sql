-- Supabase cron wiring for the notify-sms Edge Function.
-- Run this against each environment's primary database after setting the secrets below.
--
-- 1. Store the project URL + notify admin key inside Vault (only once per environment):
--      select vault.create_secret('https://PROJECT-ref.supabase.co', 'notify_sms_project_url');
--      select vault.create_secret('YOUR_NOTIFY_ADMIN_KEY', 'notify_sms_admin_key');
--    The first argument is the secret value, the second is an opaque name. Rotate secrets by
--    calling vault.update_secret('<name>', '<new value>').
--
-- 2. (Optional) Remove any previous job if you are rotating the schedule or target:
--      select cron.unschedule('notify-sms-every-minute');
--
-- 3. Schedule the job. Adjust the cron expression if you need a different frequency.
--    The example below runs once per minute and calls the Edge Function via pg_net.
select cron.schedule(
  'notify-sms-every-minute', -- unique identifier shown in pg_cron.job
  '* * * * *',               -- UTC; run every minute by default
  $$
    select
      net.http_post(
        url := (
          select decrypted_secret from vault.decrypted_secrets where name = 'notify_sms_project_url'
        ) || '/functions/v1/notify-sms',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (
            select decrypted_secret from vault.decrypted_secrets where name = 'notify_sms_admin_key'
          )
        ),
        body := jsonb_build_object('source', 'pg_cron')::jsonb
      );
  $$
);
