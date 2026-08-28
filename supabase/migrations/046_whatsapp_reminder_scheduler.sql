-- Separate one-minute scheduler for the advisor WhatsApp companion.
-- E1 remains the only business/scheduling authority. The endpoint is
-- authenticated with a server-only Vault secret and stays harmless while the
-- feature flag is disabled.

begin;

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema extensions;

do $do$
declare
  existing_job_id bigint;
begin
  select jobid
    into existing_job_id
  from cron.job
  where jobname = 'leadflow-whatsapp-reminders-every-minute';

  if existing_job_id is null then
    perform cron.schedule(
      'leadflow-whatsapp-reminders-every-minute',
      '* * * * *',
      $job$
        select net.http_post(
          url := 'https://leadflow.jrdnbrj.com/api/internal/whatsapp-reminders/dispatch',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-leadflow-whatsapp-reminder-secret',
              (select decrypted_secret
               from vault.decrypted_secrets
               where name = 'leadflow_whatsapp_reminder_dispatch_secret')
          ),
          body := '{}'::jsonb,
          timeout_milliseconds := 10000
        );
      $job$
    );
  else
    update cron.job
    set schedule = '* * * * *',
        command = $job$
          select net.http_post(
            url := 'https://leadflow.jrdnbrj.com/api/internal/whatsapp-reminders/dispatch',
            headers := jsonb_build_object(
              'Content-Type', 'application/json',
              'x-leadflow-whatsapp-reminder-secret',
                (select decrypted_secret
                 from vault.decrypted_secrets
                 where name = 'leadflow_whatsapp_reminder_dispatch_secret')
            ),
            body := '{}'::jsonb,
            timeout_milliseconds := 10000
          );
        $job$,
        active = true
    where jobid = existing_job_id;
  end if;
end;
$do$;

comment on extension pg_cron is 'LeadFlow uses one dedicated job for advisor WhatsApp reminder dispatch.';

commit;
